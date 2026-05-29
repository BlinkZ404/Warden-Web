/**
 * Orchestrator worker. Polls the job table and drives incidents forward.
 *
 *   npm run worker            # poll forever (Ctrl-C to stop)
 *   npm run worker -- --once  # drain once and exit (useful in CI / cron)
 *
 * In production this is a Lambda on an SQS trigger or a Vercel cron hitting
 * /api/orchestrator/tick; the logic (drainJobs) is identical.
 */
import { drainJobs } from "@/lib/orchestrator/runner";
import { closePool } from "@/lib/db/client";

const once = process.argv.includes("--once");

async function tick() {
  const { processed } = await drainJobs("worker-cli");
  if (processed > 0) console.log(`[worker] processed ${processed} job(s)`);
}

if (once) {
  await tick();
  await closePool();
} else {
  console.log("[worker] polling for jobs every 2s (Ctrl-C to stop)…");
  // eslint-disable-next-line no-constant-condition
  const interval = setInterval(() => {
    tick().catch((e) => console.error("[worker] tick error:", e));
  }, 2000);
  process.on("SIGINT", async () => {
    clearInterval(interval);
    await closePool();
    process.exit(0);
  });
}
