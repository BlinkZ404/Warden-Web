import { describe, it, expect, beforeEach } from "vitest";
import { resetDatabase } from "./util";
import { ingestError } from "@/lib/ingest";
import { normalizeSentryWebhook, syntheticSentryEvent } from "@/lib/adapters/sentry";
import { advanceIncident, runIncidentToBoundary } from "@/lib/orchestrator/steps";
import { getIncident } from "@/lib/repo/incidents";
import {
  latestFixAttempt,
  countFixAttempts,
  createReview,
  createVerification,
  latestApproval,
} from "@/lib/repo/artifacts";
import { query } from "@/lib/db/client";
import { listEvents } from "@/lib/repo/events";
import { setSettings } from "@/lib/repo/settings";
import { hydrateSettings } from "@/lib/runtime-config";
import { getBugByKey } from "@/lib/sim/bugs";
import { destroyWorkspace, workspaceExists } from "@/lib/adapters/workspace";

async function countBy(table: string, col: string, id: string): Promise<number> {
  const rows = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${table} WHERE ${col} = $1`,
    [id],
  );
  return rows[0].n;
}

async function fire(key: string) {
  const bug = getBugByKey(key)!;
  return ingestError(normalizeSentryWebhook(syntheticSentryEvent(bug)));
}

describe("orchestrator resumability + idempotency (M3)", () => {
  beforeEach(async () => {
    await resetDatabase();
    await hydrateSettings(); // overlay reflects the (empty) settings table — default fix budget
  });

  it("resumes from the last persisted state with no duplicate artifacts", async () => {
    const { incidentId } = await fire("checkout-missing-price");

    // Run partway, as if the worker was killed mid-pipeline.
    for (let i = 0; i < 4; i++) await advanceIncident(incidentId);
    const mid = await getIncident(incidentId);
    expect(["fix_proposed", "under_review"]).toContain(mid!.status);
    expect(await countBy("investigations", "incident_id", incidentId)).toBe(1);
    expect(await countBy("fix_attempts", "incident_id", incidentId)).toBe(1);

    // "Restart": a fresh run reads state from the DB and continues.
    const final = await runIncidentToBoundary(incidentId);
    expect(final).toBe("awaiting_approval");

    // Idempotent: exactly one of each artifact; no work was duplicated.
    expect(await countBy("investigations", "incident_id", incidentId)).toBe(1);
    expect(await countBy("fix_attempts", "incident_id", incidentId)).toBe(1);
    const fa = await latestFixAttempt(incidentId);
    expect(await countBy("reviews", "fix_attempt_id", fa!.id)).toBe(1);
    expect(await countBy("verifications", "fix_attempt_id", fa!.id)).toBe(1);

    await destroyWorkspace(incidentId);
  });

  it("idempotent step: a crash after writing an artifact but before transitioning does not duplicate it", async () => {
    const { incidentId } = await fire("discount-unknown-code");

    // Drive to under_review.
    for (let i = 0; i < 20; i++) {
      const s = (await getIncident(incidentId))!.status;
      if (s === "under_review") break;
      await advanceIncident(incidentId);
    }
    expect((await getIncident(incidentId))!.status).toBe("under_review");

    // Simulate: stepUnderReview wrote the review, then the process died before
    // transitioning. We insert the review row and leave the status untouched.
    const fa = await latestFixAttempt(incidentId);
    await createReview({
      fix_attempt_id: fa!.id,
      reviewer_agent: "codex",
      verdict: "approve",
      findings: { notes: ["pre-existing review from before the crash"] },
    });
    expect(await countBy("reviews", "fix_attempt_id", fa!.id)).toBe(1);

    // Re-running the step must reuse the existing review, not create a second.
    await advanceIncident(incidentId);
    expect((await getIncident(incidentId))!.status).toBe("verifying");
    expect(await countBy("reviews", "fix_attempt_id", fa!.id)).toBe(1);

    await destroyWorkspace(incidentId);
  });

  it("verification failure re-proposes while the attempt budget remains (sent back, never to approval)", async () => {
    const { incidentId } = await fire("checkout-missing-price");

    // Drive to `verifying` but stop before stepVerifying runs.
    for (let i = 0; i < 20; i++) {
      const s = (await getIncident(incidentId))!.status;
      if (s === "verifying") break;
      await advanceIncident(incidentId);
    }
    expect((await getIncident(incidentId))!.status).toBe("verifying");

    // Seed a FAILING verification so the step's idempotency guard reuses it
    // (simulates the real gate finding failing tests / a recurring error).
    const fa = await latestFixAttempt(incidentId);
    await createVerification({
      fix_attempt_id: fa!.id,
      preview_url: "https://preview.example",
      test_passed: false,
      error_recurred: true,
      new_errors: [],
    });

    await advanceIncident(incidentId);

    // With attempts left, the failed gate sends it back for a corrected re-proposal
    // — never to the human gate. A revision event records the failure as feedback.
    expect((await getIncident(incidentId))!.status).toBe("fix_proposed");
    expect(await latestApproval(incidentId)).toBeNull();
    const rev = (await listEvents(incidentId)).find((e) => e.type === "revision");
    expect(rev).toBeTruthy();

    // Driven to completion, the corrected second attempt verifies for real and
    // reaches the human gate — the retry recovered the incident, not escalation.
    await runIncidentToBoundary(incidentId);
    expect((await getIncident(incidentId))!.status).toBe("awaiting_approval");
    expect(await countFixAttempts(incidentId)).toBe(2);

    await destroyWorkspace(incidentId);
  });

  it("verification failure escalates once the attempt budget is spent (the gate is a hard stop)", async () => {
    await setSettings({ FIX_MAX_ATTEMPTS: "1" }); // no retry budget: the first failure is terminal
    await hydrateSettings();
    const { incidentId } = await fire("checkout-missing-price");

    for (let i = 0; i < 20; i++) {
      const s = (await getIncident(incidentId))!.status;
      if (s === "verifying") break;
      await advanceIncident(incidentId);
    }
    expect((await getIncident(incidentId))!.status).toBe("verifying");

    const fa = await latestFixAttempt(incidentId);
    await createVerification({
      fix_attempt_id: fa!.id,
      preview_url: "https://preview.example",
      test_passed: false,
      error_recurred: true,
      new_errors: [],
    });

    await advanceIncident(incidentId);

    // No attempts remain, so the failed deterministic gate escalates; no human tap
    // can override it.
    expect((await getIncident(incidentId))!.status).toBe("escalated");
    expect(await latestApproval(incidentId)).toBeNull();

    await destroyWorkspace(incidentId);
  });

  it("rebuilds a lost workspace from the persisted patch and resumes (cross-instance crash safety)", async () => {
    const { incidentId } = await fire("checkout-missing-price");

    for (let i = 0; i < 20; i++) {
      const s = (await getIncident(incidentId))!.status;
      if (s === "under_review") break;
      await advanceIncident(incidentId);
    }
    expect((await getIncident(incidentId))!.status).toBe("under_review");

    // Simulate the worker dying and the job being reclaimed on a fresh instance
    // with an empty disk.
    await destroyWorkspace(incidentId);
    expect(await workspaceExists(incidentId)).toBe(false);

    // Resume: it must rebuild the workspace from DB state and reach the gate,
    // NOT escalate.
    const final = await runIncidentToBoundary(incidentId);
    expect(final).toBe("awaiting_approval");
    expect(await workspaceExists(incidentId)).toBe(true);

    await destroyWorkspace(incidentId);
  });

  it("does nothing past a boundary (awaiting_approval is a hard stop)", async () => {
    const { incidentId } = await fire("checkout-missing-price");
    await runIncidentToBoundary(incidentId);
    expect((await getIncident(incidentId))!.status).toBe("awaiting_approval");
    // Advancing again is a no-op.
    const r = await advanceIncident(incidentId);
    expect(r.progressed).toBe(false);
    expect((await getIncident(incidentId))!.status).toBe("awaiting_approval");
    await destroyWorkspace(incidentId);
  });
});
