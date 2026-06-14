import { query, queryOne, withTransaction } from "@/lib/db/client";
import type { Job } from "@/lib/db/types";

/**
 * Add a kick to the queue. `run_after` is computed from the DATABASE clock
 * (now()), never the client clock; claimNext compares against now() too, and
 * host/container clock drift (e.g. Docker Desktop on WSL2) would otherwise make
 * a just-enqueued job look scheduled in the future and never get claimed.
 */
export async function enqueue(
  incidentId: string,
  opts: { kind?: string; runAfterMs?: number } = {},
): Promise<Job> {
  const delayMs = Math.max(0, opts.runAfterMs ?? 0);
  // At most ONE active (queued|running) job per incident; also enforced by a
  // partial unique index (migration 0003), which closes the concurrent-enqueue
  // race. If one already exists, reuse it.
  const findActive = () =>
    queryOne<Job>(
      `SELECT * FROM jobs WHERE incident_id = $1 AND status IN ('queued','running')
       ORDER BY id LIMIT 1`,
      [incidentId],
    );

  const active = await findActive();
  if (active) return active;
  try {
    return (await queryOne<Job>(
      `INSERT INTO jobs (incident_id, kind, run_after)
       VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval)
       RETURNING *`,
      [incidentId, opts.kind ?? "advance", String(delayMs)],
    ))!;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return (await findActive())!;
    throw e;
  }
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

/**
 * Mark a job done, but ONLY if this worker still owns the lease. A worker that
 * was dispossessed by reclaimStale (its lease expired and another worker took
 * over) becomes a no-op instead of clobbering the usurper's job.
 */
export async function completeJob(id: string, workerId: string): Promise<void> {
  await query(
    `UPDATE jobs SET status = 'done', locked_by = NULL, locked_at = NULL, updated_at = now()
     WHERE id = $1 AND locked_by = $2 AND status = 'running'`,
    [id, workerId],
  );
}

/** Record a failure (ownership-scoped); requeue with backoff until max_attempts, then mark failed. */
export async function failJob(id: string, workerId: string, error: string): Promise<void> {
  await query(
    `UPDATE jobs SET
       status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
       run_after = now() + (interval '5 seconds' * attempts),
       locked_by = NULL, locked_at = NULL,
       last_error = $3, updated_at = now()
     WHERE id = $1 AND locked_by = $2 AND status = 'running'`,
    [id, workerId, error.slice(0, 2000)],
  );
}

/**
 * Refresh a running job's lease. Returns false if the lease was lost (the row is
 * no longer running under this worker); the caller should stop work, because
 * another worker has taken over.
 */
export async function heartbeat(id: string, workerId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE jobs SET locked_at = now(), updated_at = now()
     WHERE id = $1 AND locked_by = $2 AND status = 'running'
     RETURNING id`,
    [id, workerId],
  );
  return rows.length > 0;
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
