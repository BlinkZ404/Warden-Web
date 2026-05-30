import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase } from "./util";
import { config } from "@/lib/config";
import { consensusOf } from "@/lib/policy/gate";
import { ingestError } from "@/lib/ingest";
import { normalizeSentryWebhook, syntheticSentryEvent } from "@/lib/adapters/sentry";
import { drainJobs } from "@/lib/orchestrator/runner";
import { getIncident, createIncident } from "@/lib/repo/incidents";
import {
  latestFixAttempt,
  listReviews,
  createReview,
  createFixAttempt,
} from "@/lib/repo/artifacts";
import { listEvents } from "@/lib/repo/events";
import { getBugByKey } from "@/lib/sim/bugs";
import type { ReviewVerdict } from "@/lib/db/types";
import { destroyWorkspace } from "@/lib/adapters/workspace";

const v = (verdict: ReviewVerdict) => ({ name: verdict, verdict });

describe("panel consensus (gate)", () => {
  it("default is unanimous; a quorum can be required instead", () => {
    expect(consensusOf([v("approve"), v("approve"), v("approve")]).proceed).toBe(true);
    expect(consensusOf([v("approve"), v("approve"), v("uncertain")]).proceed).toBe(false);
    // relax to majority (2 of 3)
    expect(consensusOf([v("approve"), v("approve"), v("uncertain")], 2).proceed).toBe(true);
    expect(consensusOf([v("approve"), v("reject"), v("uncertain")], 2).proceed).toBe(false);
    expect(consensusOf([v("reject")]).proceed).toBe(false);
    expect(consensusOf([]).proceed).toBe(false);
  });

  it("surfaces the dissent in the reason", () => {
    const c = consensusOf([{ name: "glm", verdict: "approve" }, { name: "deepseek", verdict: "reject" }]);
    expect(c.escalate).toBe(true);
    expect(c.reason).toContain("deepseek=reject");
  });
});

describe("review row idempotency (DB invariant)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("one review per (fix_attempt, reviewer) — a replayed insert is a no-op", async () => {
    const inc = await createIncident({ fingerprint: "fp-uniq", title: "x" });
    const fa = await createFixAttempt({
      incident_id: inc.id,
      branch: "b",
      commit_sha: "c",
      diff_summary: "s",
      files_changed: [],
    });
    const r1 = await createReview({
      fix_attempt_id: fa.id,
      reviewer_agent: "glm",
      verdict: "approve",
      findings: {},
    });
    const r2 = await createReview({
      fix_attempt_id: fa.id,
      reviewer_agent: "glm",
      verdict: "reject",
      findings: {},
    });
    expect(r1).not.toBeNull(); // first insert won
    expect(r2).toBeNull(); // conflict → no second row, no overwrite, scorecard skipped
    const rows = await listReviews(fa.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].verdict).toBe("approve");
  });
});

describe("reviewer panel — multi-reviewer run", () => {
  const review = config.review as { panelSize: number }; // config is `as const`
  const orig = review.panelSize;
  beforeEach(async () => {
    await resetDatabase();
    review.panelSize = 3; // read at getReviewers() call time
  });
  afterEach(() => {
    review.panelSize = orig;
  });

  async function fire(key: string) {
    return ingestError(normalizeSentryWebhook(syntheticSentryEvent(getBugByKey(key)!)));
  }

  it("runs a 3-reviewer panel and records 3 reviews + a consensus event", async () => {
    const { incidentId } = await fire("checkout-missing-price");
    await drainJobs();
    expect((await getIncident(incidentId))!.status).toBe("awaiting_approval"); // 3/3 approve

    const fa = await latestFixAttempt(incidentId);
    const reviews = await listReviews(fa!.id);
    expect(reviews).toHaveLength(3);
    expect(reviews.every((r) => r.verdict === "approve")).toBe(true);
    expect(new Set(reviews.map((r) => r.reviewer_agent)).size).toBe(3); // distinct panel members

    const consensus = (await listEvents(incidentId)).find((e) => e.type === "consensus");
    expect(consensus!.payload).toMatchObject({ total: 3, approvals: 3, proceed: true });

    await destroyWorkspace(incidentId);
  });

  it("a dissenting panel escalates without reaching verification", async () => {
    const { incidentId } = await fire("checkout-missing-price-risky");
    await drainJobs();
    expect((await getIncident(incidentId))!.status).toBe("escalated");

    const fa = await latestFixAttempt(incidentId);
    const reviews = await listReviews(fa!.id);
    expect(reviews).toHaveLength(3);
    expect(reviews.some((r) => r.verdict !== "approve")).toBe(true);

    await destroyWorkspace(incidentId);
  });
});
