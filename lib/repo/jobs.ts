import { query, queryOne, withTransaction } from "@/lib/db/client";
import type { Job } from "@/lib/db/types";

/**
 * Add a kick to the queue. `run_after` is computed from the DATABASE clock
 * (now()), never the client clock — claimNext compares against now() too, and
 * host/container clock drift (e.g. Docker Desktop on WSL2) would otherwise make
 * a just-enqueued job look scheduled in the future and never get claimed.
 */
export async function enqueue(
  incidentId: string,
  opts: { kind?: string; runAfterMs?: number } = {},
): Promise<Job> {
  const delayMs = Math.max(0, opts.runAfterMs ?? 0);
  return (await queryOne<Job>(
    `INSERT INTO jobs (incident_id, kind, run_after)
     VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval)
     RETURNING *`,
    [incidentId, opts.kind ?? "advance", String(delayMs)],
  ))!;
}

/**
 * Atomically claim the next runnable job. FOR UPDATE SKIP LOCKED lets multiple
 * workers run concurrently without grabbing the same job.
 */
export async function claimNext(workerId: string): Promise<Job | null> {
  return withTransaction(async (c) => {
    const { rows } = await c.query<Job>(
      `SELECT * FROM jobs
       WHERE status = 'queued' AND run_after <= now()
       ORDER BY id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
    );
    const job = rows[0];
    if (!job) return null;
    await c.query(
      `UPDATE jobs SET status = 'running', locked_by = $2, locked_at = now(),
         attempts = attempts + 1, updated_at = now()
       WHERE id = $1`,
      [job.id, workerId],
    );
    return { ...job, status: "running" as const };
  });
}

export async function completeJob(id: string): Promise<void> {
  await query(
    `UPDATE jobs SET status = 'done', locked_by = NULL, locked_at = NULL, updated_at = now()
     WHERE id = $1`,
    [id],
  );
}

/** Record a failure; requeue with backoff until max_attempts, then mark failed. */
export async function failJob(id: string, error: string): Promise<void> {
  await query(
    `UPDATE jobs SET
       status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
       run_after = now() + (interval '5 seconds' * attempts),
       locked_by = NULL, locked_at = NULL,
       last_error = $2, updated_at = now()
     WHERE id = $1`,
    [id, error.slice(0, 2000)],
  );
}

export async function countQueued(): Promise<number> {
  const row = await queryOne<{ count: string }>(
    "SELECT count(*)::text AS count FROM jobs WHERE status = 'queued'",
  );
  return Number(row?.count ?? 0);
}

/** Release jobs whose worker died mid-run (lock older than `staleMs`). */
export async function reclaimStale(staleMs = 120_000): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE jobs SET status = 'queued', locked_by = NULL, locked_at = NULL, updated_at = now()
     WHERE status = 'running' AND locked_at < now() - ($1 || ' milliseconds')::interval
     RETURNING id`,
    [String(staleMs)],
  );
  return rows.length;
}
