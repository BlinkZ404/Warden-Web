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
  reclaimStale,
} from "@/lib/repo/jobs";
import { runIncidentToBoundary } from "@/lib/orchestrator/steps";
import { getIncident } from "@/lib/repo/incidents";
import { transition, canTransition } from "@/lib/statemachine";
import { logError } from "@/lib/events";

export interface DrainResult {
  processed: number;
}

/** Process all currently-runnable jobs, then return. */
export async function drainJobs(
  workerId = "worker-1",
  opts: { max?: number } = {},
): Promise<DrainResult> {
  await reclaimStale();
  let processed = 0;
  const max = opts.max ?? 200;

  for (let i = 0; i < max; i++) {
    const job = await claimNext(workerId);
    if (!job) break;
    processed++;

    try {
      await runIncidentToBoundary(job.incident_id);
      await completeJob(job.id);
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
      await failJob(job.id, msg);
    }
  }

  return { processed };
}
