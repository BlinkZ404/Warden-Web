/**
 * Job-processing worker (PLAN §7 lightweight job table). Claims queued jobs and
 * drives each incident to its next boundary. Fault-isolated: a failure on one
 * incident is recorded to `events` and retried with backoff; after max attempts
 * the incident is escalated to a human rather than crashing the run (advisor
 * guidance for unattended operation).
 */
import {
  claimNext,
  completeJob,
  failJob,
  heartbeat,
  reclaimStale,
} from "@/lib/repo/jobs";
import { runIncidentToBoundary } from "@/lib/orchestrator/steps";
import { getIncident } from "@/lib/repo/incidents";
import { transition, canTransition } from "@/lib/statemachine";
import { logEvent, logError } from "@/lib/events";
import { hydrateSettings } from "@/lib/runtime-config";
import { insufficientBalance } from "@/lib/billing";

export interface DrainResult {
  processed: number;
}

/**
 * Whether a route should drain the queue inline, in the same request that
 * enqueued the work. On a host with a real filesystem (local dev, a VM, the
 * worker box) the route can advance the pipeline immediately. On Vercel the
 * pipeline can't run in a function (read-only FS, no git), so the route just
 * enqueues and the always-on worker drains it. Continuation is queue-driven
 * either way (ingest and approval both enqueue), so skipping the inline drain
 * only changes *who* runs the job, not whether it runs.
 *
 * `WARDEN_INLINE_DRAIN` ("1"/"0") forces the choice; otherwise inline unless on
 * Vercel (which sets `VERCEL=1` in every deployment).
 */
export function shouldDrainInline(): boolean {
  const flag = process.env.WARDEN_INLINE_DRAIN;
  if (flag === "1") return true;
  if (flag === "0") return false;
  return !process.env.VERCEL;
}

/** Process all currently-runnable jobs, then return. */
export async function drainJobs(
  workerId = "worker-1",
  opts: { max?: number } = {},
): Promise<DrainResult> {
  // Load the saved settings (run mode, billing mode, model assignments) so the
  // pipeline + metering read the dashboard's choices, not just the ambient env.
  await hydrateSettings();
  await reclaimStale();
  let processed = 0;
  const max = opts.max ?? 200;

  for (let i = 0; i < max; i++) {
    const job = await claimNext(workerId);
    if (!job) break;
    processed++;

    // Managed inference runs on a prepaid balance: if it's empty, hold NEW work
    // at the door (an in-flight incident is left to finish) until a top-up.
    const inc = await getIncident(job.incident_id);
    if (inc?.status === "detected" && (await insufficientBalance())) {
      await logEvent(job.incident_id, "billing", "system", {
        reason: "insufficient_balance",
        note: "Managed inference paused: wallet balance is empty. Top up to continue.",
      });
      if (canTransition(inc.status, "escalated")) {
        await transition(job.incident_id, "escalated", "system", {
          reason: "insufficient balance; top up to continue",
        });
      }
      await completeJob(job.id, workerId);
      continue;
    }

    try {
      // Heartbeat the lease between steps so a long-running job isn't reclaimed
      // out from under us; bail if we lose the lease to another worker.
      await runIncidentToBoundary(job.incident_id, {
        heartbeat: () => heartbeat(job.id, workerId),
      });
      await completeJob(job.id, workerId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logError(job.incident_id, "system", "pipeline step failed", { error: msg });

      const isFinalAttempt = job.attempts + 1 >= job.max_attempts;
      if (isFinalAttempt) {
        const inc = await getIncident(job.incident_id);
        if (inc && canTransition(inc.status, "escalated")) {
          await transition(job.incident_id, "escalated", "system", {
            reason: `pipeline failed after ${job.attempts + 1} attempts: ${msg}`,
          });
        }
      }
      await failJob(job.id, workerId, msg);
    }
  }

  return { processed };
}
