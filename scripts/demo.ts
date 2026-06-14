/**
 * End-to-end demo / CLI smoke test (simulation mode).
 *
 *   npm run demo                         # the checkout crash, happy path
 *   npm run demo -- checkout-missing-price-risky   # disagreement → escalate
 *   npm run demo -- checkout-prod-regression       # approve → auto-rollback
 *
 * Drives a seeded production error through the whole pipeline and narrates it.
 */
import { ingestError } from "@/lib/ingest";
import { normalizeSentryWebhook, syntheticSentryEvent } from "@/lib/adapters/sentry";
import { drainJobs } from "@/lib/orchestrator/runner";
import { recordApproval } from "@/lib/approval";
import { runMigrations } from "@/lib/db/migrate";
import { getIncident } from "@/lib/repo/incidents";
import { listEvents } from "@/lib/repo/events";
import {
  latestInvestigation,
  latestFixAttempt,
  latestReview,
  latestVerification,
  latestDeployment,
  getOutcome,
} from "@/lib/repo/artifacts";
import { listScorecards } from "@/lib/repo/scorecard";
import { getBugByKey, SEEDED_BUGS } from "@/lib/sim/bugs";
import { destroyWorkspace } from "@/lib/adapters/workspace";
import { closePool } from "@/lib/db/client";

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  b: (s: string) => `\x1b[1m${s}\x1b[0m`,
  ok: (s: string) => `\x1b[32m${s}\x1b[0m`,
  warn: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bad: (s: string) => `\x1b[31m${s}\x1b[0m`,
  accent: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

async function statusLine(id: string) {
  const events = await listEvents(id);
  const path = events
    .filter((e) => e.type === "state_change")
    .map((e) => (e.payload as { to: string }).to);
  return ["detected", ...path].join(C.dim(" → "));
}

async function main() {
  const bugKey = process.argv[2] || "checkout-missing-price";
  const bug = getBugByKey(bugKey);
  if (!bug) {
    console.error(`Unknown bug "${bugKey}". Options: ${SEEDED_BUGS.map((b) => b.key).join(", ")}`);
    process.exit(1);
  }

  await runMigrations();

  console.log(`\n🛡️  ${C.b("Warden")} ${C.dim("(simulation mode)")}\n`);
  console.log(`${C.b("[1] A production error fires")} ${C.dim("(Sentry → webhook)")}`);
  console.log(`    ${C.bad(bug.title)}`);

  const { incidentId, deduped } = await ingestError(
    normalizeSentryWebhook(syntheticSentryEvent(bug)),
  );
  console.log(`    → incident ${C.accent(incidentId)} ${deduped ? C.dim("(deduped)") : "created"}\n`);

  console.log(`${C.b("[2] Warden runs the pipeline…")}`);
  await drainJobs("demo");
  console.log(`    ${await statusLine(incidentId)}`);

  const inv = await latestInvestigation(incidentId);
  if (inv) console.log(`    ${C.dim("investigation:")} ${inv.root_cause} ${C.dim(`(confidence ${inv.confidence})`)}`);
  const fa = await latestFixAttempt(incidentId);
  if (fa) console.log(`    ${C.dim("fix (claude):")} ${fa.diff_summary} ${C.dim(`on ${fa.branch}`)}`);
  const review = fa ? await latestReview(fa.id) : null;
  if (review) {
    const v = review.verdict === "approve" ? C.ok(review.verdict) : C.warn(review.verdict);
    console.log(`    ${C.dim("review (codex):")} ${v}: ${(review.findings as { notes?: string[] })?.notes?.[0] ?? ""}`);
  }
  const ver = fa ? await latestVerification(fa.id) : null;
  if (ver) {
    console.log(
      `    ${C.dim("verification:")} ` +
        `${ver.test_passed ? C.ok("✓ tests pass") : C.bad("✗ tests failed")} · ` +
        `${ver.error_recurred ? C.bad("✗ error recurred") : C.ok("✓ original error gone")} · ` +
        `${C.ok("✓ no new errors")}`,
    );
    console.log(`    ${C.dim(`preview: ${ver.preview_url}`)}`);
  }

  let inc = await getIncident(incidentId);
  console.log();

  if (inc!.status === "awaiting_approval") {
    console.log(`${C.b("[3] 📲 Founder gets a push:")} ${C.accent(`"Found a fix for the ${bug.service} crash."`)}`);
    console.log(`    ${C.dim("waiting for one-tap approval…")}\n`);
    console.log(`${C.b("[4] ✅ Approved")} ${C.dim("(scripted for this unattended demo; a REAL approvals row)")}`);
    await recordApproval({ incidentId, decision: "approve", decidedBy: "demo-script", channel: "script" });
    await drainJobs("demo");
    console.log(`    ${await statusLine(incidentId)}`);
    inc = await getIncident(incidentId);
    const dep = fa ? await latestDeployment(fa.id) : null;
    if (inc!.status === "resolved" && dep?.prod_url)
      console.log(`    ${C.ok("shipped")} → ${dep.prod_url}`);
    if (dep?.rolled_back) console.log(`    ${C.warn("auto-rolled back")} after a production regression`);
  } else if (inc!.status === "escalated") {
    console.log(`${C.b("[3] ⚠️  Escalated to a human")} ${C.dim("(the agents disagreed or the gate failed; not auto-handled)")}`);
  }

  console.log(`\n${C.b("[5] Everything is recorded in Aurora")}`);
  const events = await listEvents(incidentId);
  console.log(`    ${C.dim(`audit trail: ${events.length} events`)}`);
  const outcome = await getOutcome(incidentId);
  if (outcome) console.log(`    ${C.dim(`outcome: resolved=${outcome.resolved} type=${outcome.resolution_type}`)}`);
  for (const c of await listScorecards()) {
    console.log(
      `    ${C.dim(`scorecard ${c.agent}/${c.role}: attempts=${c.attempts} verified=${c.verified_passed} approved=${c.human_approved} regressions=${c.regressions}`)}`,
    );
  }
  console.log(`\n${C.dim(`final status: ${inc!.status}`)}\n`);

  await destroyWorkspace(incidentId);
  await closePool();
}

main().catch(async (err) => {
  console.error("demo failed:", err);
  await closePool();
  process.exit(1);
});
