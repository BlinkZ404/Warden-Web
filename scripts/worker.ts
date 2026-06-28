/**
 * Orchestrator worker. Polls the job table and drives incidents forward.
 *
 *   npm run worker            # poll forever (Ctrl-C to stop)
 *   npm run worker -- --once  # drain once and exit (useful in CI / cron)
 *
 * This is the real driver of the autonomous loop. It must run on an always-on
 * host with a writable filesystem and the `git` binary: the pipeline clones the
 * target repo, writes under .warden/, and boots the app to replay the failing
 * request. That rules out Lambda / Vercel functions (read-only FS, no git) and
 * points at ECS Fargate or a VM (EC2 / Lightsail). See
 * docs/operations/deploy-aws.md. The Vercel cron that GETs
 * /api/orchestrator/tick is only a recovery safety-net; the logic (drainJobs)
 * is identical.
 */
import { writeFile } from "node:fs/promises";
import { drainJobs } from "@/lib/orchestrator/runner";
import { closePool } from "@/lib/db/client";

const once = process.argv.includes("--once");

// Liveness signal for the container HEALTHCHECK. A completed drain means the DB
// is reachable and the loop is turning; a hang or DB outage stops the writes, so
// the heartbeat goes stale and the orchestrator restarts the worker. Best-effort:
// a write failure (e.g. no /tmp on a dev box) must never crash the loop.
const HEARTBEAT = "/tmp/warden-worker.alive";

async function tick() {
  const { processed } = await drainJobs("worker-cli");
  await writeFile(HEARTBEAT, String(Date.now())).catch(() => {});
  if (processed > 0) console.log(`[worker] processed ${processed} job(s)`);
}

if (once) {
  await tick();
  await closePool();
} else {
  console.log("[worker] polling for jobs every 2s (Ctrl-C to stop)…");
  const interval = setInterval(() => {
    tick().catch((e) => console.error("[worker] tick error:", e));
  }, 2000);
  // SIGINT (Ctrl-C) and SIGTERM (docker/ECS stop) both drain the pool cleanly.
  const shutdown = async () => {
    clearInterval(interval);
    await closePool();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
