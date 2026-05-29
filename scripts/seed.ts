/**
 * Seed the database with a representative spread of incidents so the dashboard
 * looks alive for a demo: one resolved, one escalated, one awaiting approval,
 * and a repeat (recognized via pgvector memory).
 *
 *   npm run seed
 */
import { ingestError } from "@/lib/ingest";
import { normalizeSentryWebhook, syntheticSentryEvent } from "@/lib/adapters/sentry";
import { drainJobs } from "@/lib/orchestrator/runner";
import { recordApproval } from "@/lib/approval";
import { runMigrations } from "@/lib/db/migrate";
import { getBugByKey } from "@/lib/sim/bugs";
import { closePool } from "@/lib/db/client";

async function fire(bugKey: string) {
  const bug = getBugByKey(bugKey)!;
  const { incidentId } = await ingestError(
    normalizeSentryWebhook(syntheticSentryEvent(bug)),
  );
  await drainJobs("seed");
  return incidentId;
}

async function main() {
  await runMigrations();
  console.log("[seed] populating demo incidents…");

  // 1) Resolved end-to-end (with scripted approval).
  const resolved = await fire("checkout-missing-price");
  await recordApproval({
    incidentId: resolved,
    decision: "approve",
    decidedBy: "founder",
    channel: "web",
  });
  await drainJobs("seed");
  console.log(`[seed] resolved incident:           ${resolved}`);

  // 2) Repeat of the same error → recognized via pgvector memory.
  const repeat = await fire("checkout-missing-price");
  console.log(`[seed] repeat (memory) incident:    ${repeat}`);

  // 3) Escalated (over-scoped fix caught by the reviewer).
  const escalated = await fire("checkout-missing-price-risky");
  console.log(`[seed] escalated incident:          ${escalated}`);

  // 4) Awaiting approval (a live decision for the demo).
  const pending = await fire("discount-unknown-code");
  console.log(`[seed] awaiting-approval incident:  ${pending}`);

  console.log("[seed] done. Open the dashboard at /dashboard.");
  await closePool();
}

main().catch(async (err) => {
  console.error("[seed] failed:", err);
  await closePool();
  process.exit(1);
});
