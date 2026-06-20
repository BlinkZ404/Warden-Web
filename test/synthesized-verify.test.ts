import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Proof of the test-less-repo headline. We simulate a target app that ships no
 * tests: `node --test` collects zero. EVERYTHING ELSE in the pipeline runs for
 * real (workspace, fix, the actual event reproduction), so this exercises the
 * synthesized-verification path end to end rather than stubbing the gate. Without
 * the synthesizer this incident would escalate for lack of a suite; with it, the
 * captured production-failing request that no longer throws stands in for the
 * missing tests and the incident reaches the human gate.
 */
vi.mock("@/lib/adapters/workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/adapters/workspace")>();
  return {
    ...actual,
    runTests: vi.fn(async () => ({ code: 0, stdout: "", stderr: "", testsRun: 0 })),
  };
});

import { resetDatabase } from "./util";
import { ingestError } from "@/lib/ingest";
import { normalizeSentryWebhook, syntheticSentryEvent } from "@/lib/adapters/sentry";
import { drainJobs } from "@/lib/orchestrator/runner";
import { getIncident } from "@/lib/repo/incidents";
import { listEvents } from "@/lib/repo/events";
import { getBugByKey } from "@/lib/sim/bugs";
import { latestFixAttempt, latestVerification } from "@/lib/repo/artifacts";
import { destroyWorkspace } from "@/lib/adapters/workspace";

async function fire(bugKey: string) {
  const bug = getBugByKey(bugKey)!;
  const norm = normalizeSentryWebhook(syntheticSentryEvent(bug));
  return ingestError(norm);
}

describe("synthesized verification for a test-less repo", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("a repo with zero tests still verifies via the event reproduction, not an escalation", async () => {
    const { incidentId } = await fire("checkout-missing-price");
    await drainJobs();

    // Reached the human gate, NOT escalated, even though no tests were collected.
    expect((await getIncident(incidentId))!.status).toBe("awaiting_approval");

    const fa = await latestFixAttempt(incidentId);
    const v = await latestVerification(fa!.id);
    expect(v!.test_passed).toBe(true);
    expect(v!.error_recurred).toBe(false);

    // The audit records HOW it verified: the synthesized reproduction stood in
    // for the absent suite.
    const ver = (await listEvents(incidentId)).find((e) => e.type === "verification");
    expect(ver).toBeTruthy();
    const p = ver!.payload as Record<string, unknown>;
    expect(p.tests_collected).toBe(0);
    expect(p.verified_via).toBe("synthesized-repro");

    await destroyWorkspace(incidentId);
  });
});
