import { describe, it, expect, beforeEach } from "vitest";
import { resetDatabase } from "./util";
import { ingestError } from "@/lib/ingest";
import { normalizeSentryWebhook, syntheticSentryEvent } from "@/lib/adapters/sentry";
import { runIncidentToBoundary } from "@/lib/orchestrator/steps";
import { recordApproval } from "@/lib/approval";
import { getIncident } from "@/lib/repo/incidents";
import { latestFixAttempt, latestDeployment } from "@/lib/repo/artifacts";
import { query } from "@/lib/db/client";
import { getBugByKey } from "@/lib/sim/bugs";
import { destroyWorkspace } from "@/lib/adapters/workspace";
import { deployParityOk } from "@/lib/policy/gate";

async function fire(key: string) {
 const bug = getBugByKey(key)!;
 return ingestError(normalizeSentryWebhook(syntheticSentryEvent(bug)));
}

/**
 * AUDIT C1; "ship the exact bytes you verified". The gate verifies a specific
 * commit; promotion must only ever happen for the artifact built from THAT
 * commit. A mismatch (wrong ref, unpushed branch, missing repo id) escalates.
 */
describe("deploy parity (AUDIT C1)", () => {
 beforeEach(async () => {
 await resetDatabase();
 });

 it("deployParityOk: only a present, matching pair passes", () => {
 expect(deployParityOk("abc", "abc")).toBe(true);
 expect(deployParityOk("abc", "def")).toBe(false);
 expect(deployParityOk(null, "abc")).toBe(false);
 expect(deployParityOk("abc", null)).toBe(false);
 expect(deployParityOk(undefined, undefined)).toBe(false);
 });

 it("records the built commit at deploy time and promotes only that artifact", async () => {
 const { incidentId } = await fire("checkout-missing-price");
 await runIncidentToBoundary(incidentId); // → awaiting_approval, preview deployed
 const fa = await latestFixAttempt(incidentId);
 const dep = await latestDeployment(fa!.id);

 // parity recorded: the deployment was built from the verified commit
 expect(dep!.built_commit_sha).toBe(fa!.commit_sha);

 await recordApproval({ incidentId, decision: "approve", decidedBy: "test", channel: "test" });
 await runIncidentToBoundary(incidentId); // approved → deploying (parity ok) → … → resolved

 expect((await getIncident(incidentId))!.status).toBe("resolved");
 expect((await latestDeployment(fa!.id))!.promoted_at).not.toBeNull();

 await destroyWorkspace(incidentId);
 });

 it("escalates instead of promoting when the built commit != the verified commit", async () => {
 const { incidentId } = await fire("checkout-missing-price");
 await runIncidentToBoundary(incidentId); // → awaiting_approval
 const fa = await latestFixAttempt(incidentId);
 const dep = await latestDeployment(fa!.id);

 // Simulate Vercel having built a DIFFERENT commit than the one we verified.
 await query("UPDATE deployments SET built_commit_sha = $2 WHERE id = $1", [
 dep!.id,
 "deadbeefdeadbeef",
 ]);

 await recordApproval({ incidentId, decision: "approve", decidedBy: "test", channel: "test" });
 await runIncidentToBoundary(incidentId); // approved → deploying → parity fails → escalated

 expect((await getIncident(incidentId))!.status).toBe("escalated");
 // never promoted: we did not ship a tree we didn't verify
 expect((await latestDeployment(fa!.id))!.promoted_at).toBeNull();

 await destroyWorkspace(incidentId);
 });
});
