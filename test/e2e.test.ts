import { describe, it, expect, beforeEach } from "vitest";
import { resetDatabase } from "./util";
import { ingestError } from "@/lib/ingest";
import { normalizeSentryWebhook, syntheticSentryEvent } from "@/lib/adapters/sentry";
import { drainJobs } from "@/lib/orchestrator/runner";
import { recordApproval } from "@/lib/approval";
import { getIncident } from "@/lib/repo/incidents";
import { listEvents } from "@/lib/repo/events";
import { getBugByKey } from "@/lib/sim/bugs";
import {
  latestFixAttempt,
  countFixAttempts,
  latestReview,
  latestVerification,
  latestApproval,
  latestDeployment,
  getOutcome,
} from "@/lib/repo/artifacts";
import { listScorecards } from "@/lib/repo/scorecard";
import { destroyWorkspace } from "@/lib/adapters/workspace";

/** Fire a seeded bug through the real ingest/normalize path. */
async function fire(bugKey: string) {
  const bug = getBugByKey(bugKey)!;
  const norm = normalizeSentryWebhook(syntheticSentryEvent(bug));
  return ingestError(norm);
}

function payload(e: { payload: Record<string, unknown> }) {
  return e.payload as Record<string, unknown>;
}

describe("§13 acceptance: end to end (simulation mode)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("detect → investigate → fix → review → verify → approve → deploy → verify → resolved", async () => {
    const { incidentId, deduped } = await fire("checkout-missing-price");
    expect(deduped).toBe(false);

    // Automated pipeline runs up to the human gate and STOPS.
    await drainJobs();
    expect((await getIncident(incidentId))!.status).toBe("awaiting_approval");

    // Nothing shipped without approval.
    expect(await latestApproval(incidentId)).toBeNull();
    const fa = await latestFixAttempt(incidentId);
    expect(fa).not.toBeNull();
    expect((await latestDeployment(fa!.id))!.promoted_at).toBeNull();

    // The deterministic gate actually passed (real tests + real reproduction).
    const v = await latestVerification(fa!.id);
    expect(v!.test_passed).toBe(true);
    expect(v!.error_recurred).toBe(false);

    // The independent reviewer approved on real diff analysis.
    expect((await latestReview(fa!.id))!.verdict).toBe("approve");

    // Human consents (scripted, but a REAL approvals row; gate is identical).
    await recordApproval({
      incidentId,
      decision: "approve",
      decidedBy: "demo-script",
      channel: "script",
    });
    await drainJobs();

    expect((await getIncident(incidentId))!.status).toBe("resolved");

    // Approval recorded; prod promotion happened.
    expect((await latestApproval(incidentId))!.decision).toBe("approve");
    expect((await latestDeployment(fa!.id))!.promoted_at).not.toBeNull();

    // Outcome + scorecard reflect the run.
    expect((await getOutcome(incidentId))!.resolved).toBe(true);
    const fixer = (await listScorecards()).find((c) => c.role === "fixer")!;
    expect(fixer.verified_passed).toBeGreaterThanOrEqual(1);
    expect(fixer.human_approved).toBeGreaterThanOrEqual(1);

    // Complete, inspectable audit trail.
    const events = await listEvents(incidentId);
    const stateChanges = events.filter((e) => e.type === "state_change");
    expect(stateChanges[0].payload).toMatchObject({ from: "detected", to: "triaging" });
    expect(stateChanges.at(-1)!.payload).toMatchObject({ to: "resolved" });
    expect(events.some((e) => e.type === "verification")).toBe(true);
    expect(events.some((e) => e.type === "approval")).toBe(true);
    expect(events.some((e) => e.type === "deploy")).toBe(true);

    await destroyWorkspace(incidentId);
  });

  it("invariant: cannot reach prod without a human approval row", async () => {
    const { incidentId } = await fire("checkout-missing-price");
    await drainJobs();
    await drainJobs(); // draining again must not advance past the gate
    const inc = await getIncident(incidentId);
    expect(inc!.status).toBe("awaiting_approval");
    const fa = await latestFixAttempt(incidentId);
    expect((await latestDeployment(fa!.id))!.promoted_at).toBeNull();
    await destroyWorkspace(incidentId);
  });

  it("disagreement → auto-revised: the reviewer's scope feedback is fed back and the tighter fix passes", async () => {
    const { incidentId } = await fire("checkout-missing-price-risky");
    await drainJobs();

    // The over-scoped first attempt is caught, fed back, and the tightened second
    // attempt passes review + verification: it reaches the human gate, not escalation.
    expect((await getIncident(incidentId))!.status).toBe("awaiting_approval");
    expect(await countFixAttempts(incidentId)).toBeGreaterThanOrEqual(2);
    expect((await listEvents(incidentId)).some((e) => e.type === "revision")).toBe(true);

    const fa = await latestFixAttempt(incidentId);
    expect((await latestReview(fa!.id))!.verdict).toBe("approve");
    expect((await latestVerification(fa!.id))!.test_passed).toBe(true);
    await destroyWorkspace(incidentId);
  });

  it("bounded: a stubbornly over-scoped fix escalates after MAX attempts and never ships", async () => {
    const { incidentId } = await fire("checkout-stubborn-scope");
    await drainJobs();

    expect((await getIncident(incidentId))!.status).toBe("escalated");
    expect(await countFixAttempts(incidentId)).toBe(3); // MAX_FIX_ATTEMPTS
    // The last attempt never reached verification; nothing shipped.
    const fa = await latestFixAttempt(incidentId);
    expect(await latestVerification(fa!.id)).toBeNull();
    expect(await latestApproval(incidentId)).toBeNull();
    await destroyWorkspace(incidentId);
  });

  it("approved fix that regresses in prod → auto rollback", async () => {
    const { incidentId } = await fire("checkout-prod-regression");
    await drainJobs();
    expect((await getIncident(incidentId))!.status).toBe("awaiting_approval");

    await recordApproval({
      incidentId,
      decision: "approve",
      decidedBy: "demo-script",
      channel: "script",
    });
    await drainJobs();

    // Auto-rolled back: the rollback is the resting state (a human reviews it),
    // so it stays rolled_back rather than escalating on top of the revert.
    expect((await getIncident(incidentId))!.status).toBe("rolled_back");
    const fa = await latestFixAttempt(incidentId);
    expect((await latestDeployment(fa!.id))!.rolled_back).toBe(true);
    const fixer = (await listScorecards()).find((c) => c.role === "fixer")!;
    expect(fixer.regressions).toBeGreaterThanOrEqual(1);
    await destroyWorkspace(incidentId);
  });

  it("human reject → dismissed; nothing ships and it isn't resurrected", async () => {
    const { incidentId } = await fire("checkout-missing-price");
    await drainJobs();
    expect((await getIncident(incidentId))!.status).toBe("awaiting_approval");

    await recordApproval({
      incidentId,
      decision: "reject",
      decidedBy: "founder",
      channel: "web",
    });
    expect((await getIncident(incidentId))!.status).toBe("dismissed");

    const fa = await latestFixAttempt(incidentId);
    expect((await latestDeployment(fa!.id))!.promoted_at).toBeNull();

    await drainJobs(); // must not resurrect a dismissed incident
    expect((await getIncident(incidentId))!.status).toBe("dismissed");

    await destroyWorkspace(incidentId);
  });

  it("dedup: a duplicate fingerprint does not open a second incident", async () => {
    const a = await fire("discount-unknown-code");
    const b = await fire("discount-unknown-code");
    expect(b.deduped).toBe(true);
    expect(b.incidentId).toBe(a.incidentId);
    await drainJobs();
    await destroyWorkspace(a.incidentId);
  });

  it("memory: a repeat incident is recognized via pgvector", async () => {
    const first = await fire("discount-unknown-code");
    await drainJobs();
    await recordApproval({
      incidentId: first.incidentId,
      decision: "approve",
      decidedBy: "demo-script",
      channel: "script",
    });
    await drainJobs();
    expect((await getIncident(first.incidentId))!.status).toBe("resolved");

    // Same error recurs → a fresh incident (the prior one resolved).
    const again = await fire("discount-unknown-code");
    expect(again.deduped).toBe(false);
    expect(again.incidentId).not.toBe(first.incidentId);
    await drainJobs();

    const mem = (await listEvents(again.incidentId)).find((e) => e.type === "memory");
    expect(mem, "expected a memory 'seen before' event").toBeTruthy();
    expect(payload(mem!).seenBefore).toBe(true);
    const matches = payload(mem!).matches as { id: string }[];
    expect(matches[0].id).toBe(first.incidentId);

    await destroyWorkspace(first.incidentId);
    await destroyWorkspace(again.incidentId);
  });
});
