import { describe, it, expect, beforeEach } from "vitest";
import { resetDatabase } from "./util";
import { ingestError } from "@/lib/ingest";
import { normalizeSentryWebhook, syntheticSentryEvent } from "@/lib/adapters/sentry";
import { runIncidentToBoundary } from "@/lib/orchestrator/steps";
import { recordApproval } from "@/lib/approval";
import { drainJobs } from "@/lib/orchestrator/runner";
import { getBugByKey } from "@/lib/sim/bugs";
import { destroyWorkspace } from "@/lib/adapters/workspace";
import { computeMetrics, safeRate } from "@/lib/repo/metrics";

describe("metrics: derived accuracy & fleet rates", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("safeRate returns a fraction, or null when there is no signal yet", () => {
    expect(safeRate(3, 4)).toBe(0.75);
    expect(safeRate(0, 1)).toBe(0);
    expect(safeRate(0, 0)).toBeNull();
    expect(safeRate(1, 0)).toBeNull();
  });

  it("a single approved + shipped incident yields perfect fixer accuracy and 100% autonomy", async () => {
    const bug = getBugByKey("checkout-missing-price")!;
    const { incidentId } = await ingestError(
      normalizeSentryWebhook(syntheticSentryEvent(bug)),
    );
    await runIncidentToBoundary(incidentId); // → awaiting_approval (gate passed)
    await recordApproval({
      incidentId,
      decision: "approve",
      decidedBy: "test",
      channel: "test",
    });
    await drainJobs("test"); // approved → deploying → verifying_prod → resolved

    const m = await computeMetrics();

    // Fleet: one clean run through the whole loop, no escalation, no revert.
    expect(m.fleet.totalIncidents).toBe(1);
    expect(m.fleet.reachedApproval).toBe(1);
    expect(m.fleet.escalated).toBe(0);
    expect(m.fleet.shipped).toBe(1);
    expect(m.fleet.reverted).toBe(0);
    expect(m.fleet.resolved).toBe(1);
    expect(m.fleet.approvalRate).toBe(1); // 1 approved / 1 verified-and-awaiting
    expect(m.fleet.autonomyRate).toBe(1); // 1 reached approval / 1 decided (none escalated)
    expect(m.fleet.revertRate).toBe(0); // 0 reverted / 1 shipped
    expect(m.fleet.revertWithinCeiling).toBe(true); // 0% is under the kill-switch
    expect(m.fleet.timeToVerifiedSec).not.toBeNull();
    expect(m.fleet.timeToVerifiedSec!).toBeGreaterThanOrEqual(0);

    // Fixer accuracy is derived and anchored to the gate, not self-rating.
    const fixer = m.agents.find((a) => a.role === "fixer")!;
    expect(fixer.verifyRate).toBe(1); // 1 verified / 1 attempt
    expect(fixer.approvalRate).toBe(1); // 1 approved / 1 verified
    expect(fixer.regressionRate).toBe(0); // 0 regressions / 1 approved

    // Reviewers do not get fixer-style rates (the credits land on the fixer).
    const reviewer = m.agents.find((a) => a.role === "reviewer");
    if (reviewer) {
      expect(reviewer.verifyRate).toBeNull();
      expect(reviewer.attempts).toBeGreaterThan(0);
    }

    await destroyWorkspace(incidentId);
  });

  it("an escalated incident pulls autonomy below 100% and never ships", async () => {
    // Happy path → reaches approval.
    const ok = getBugByKey("checkout-missing-price")!;
    const a = await ingestError(normalizeSentryWebhook(syntheticSentryEvent(ok)));
    await runIncidentToBoundary(a.incidentId);

    // Disagreement path → escalates before verification.
    const risky = getBugByKey("checkout-missing-price-risky")!;
    const b = await ingestError(normalizeSentryWebhook(syntheticSentryEvent(risky)));
    await runIncidentToBoundary(b.incidentId);

    const m = await computeMetrics();
    expect(m.fleet.reachedApproval).toBe(1);
    expect(m.fleet.escalated).toBe(1);
    expect(m.fleet.autonomyRate).toBe(0.5); // 1 of 2 decided incidents auto-handled
    expect(m.fleet.shipped).toBe(0); // nothing approved → nothing shipped

    await destroyWorkspace(a.incidentId);
    await destroyWorkspace(b.incidentId);
  });
});
