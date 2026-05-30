import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase } from "./util";
import { config } from "@/lib/config";
import { consensusOf } from "@/lib/policy/gate";
import { ingestError } from "@/lib/ingest";
import { normalizeSentryWebhook, syntheticSentryEvent } from "@/lib/adapters/sentry";
import { drainJobs } from "@/lib/orchestrator/runner";
import { getIncident } from "@/lib/repo/incidents";
import { latestFixAttempt, listReviews } from "@/lib/repo/artifacts";
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

describe("reviewer panel — multi-reviewer run", () => {
  const orig = config.review.panelSize;
  beforeEach(async () => {
    await resetDatabase();
    config.review.panelSize = 3; // read at getReviewers() call time
  });
  afterEach(() => {
    config.review.panelSize = orig;
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
