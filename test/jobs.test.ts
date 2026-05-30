import { describe, it, expect, beforeEach } from "vitest";
import { resetDatabase } from "./util";
import {
  enqueue,
  claimNext,
  completeJob,
  failJob,
  heartbeat,
  reclaimStale,
} from "@/lib/repo/jobs";
import { drainJobs } from "@/lib/orchestrator/runner";
import { createIncident, getIncident } from "@/lib/repo/incidents";
import { transition } from "@/lib/statemachine";
import { query, queryOne } from "@/lib/db/client";

async function jobStatus(id: string) {
  const r = await queryOne<{ status: string; attempts: number }>(
    "SELECT status, attempts FROM jobs WHERE id = $1",
    [id],
  );
  return r!;
}

describe("job queue concurrency & failure handling (audit H3, M6)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("complete/fail are ownership-scoped: a dispossessed worker is a no-op", async () => {
    const inc = await createIncident({ fingerprint: "fp-own", title: "x" });
    await enqueue(inc.id);
    const job = await claimNext("worker-A");
    expect(job).not.toBeNull();

    await completeJob(job!.id, "worker-B"); // wrong owner
    expect((await jobStatus(job!.id)).status).toBe("running"); // unchanged

    await completeJob(job!.id, "worker-A"); // real owner
    expect((await jobStatus(job!.id)).status).toBe("done");
  });

  it("heartbeat only succeeds for the owning worker on a running job", async () => {
    const inc = await createIncident({ fingerprint: "fp-hb", title: "x" });
    await enqueue(inc.id);
    const job = await claimNext("worker-A");
    expect(await heartbeat(job!.id, "worker-A")).toBe(true);
    expect(await heartbeat(job!.id, "worker-B")).toBe(false);
    await completeJob(job!.id, "worker-A");
    expect(await heartbeat(job!.id, "worker-A")).toBe(false); // not running anymore
  });

  it("reclaimStale requeues a job whose worker died", async () => {
    const inc = await createIncident({ fingerprint: "fp-stale", title: "x" });
    await enqueue(inc.id);
    const job = await claimNext("worker-dead");
    await query("UPDATE jobs SET locked_at = now() - interval '5 minutes' WHERE id = $1", [job!.id]);
    expect(await reclaimStale(60_000)).toBeGreaterThanOrEqual(1);
    const row = await queryOne<{ status: string; locked_by: string | null }>(
      "SELECT status, locked_by FROM jobs WHERE id = $1",
      [job!.id],
    );
    expect(row!.status).toBe("queued");
    expect(row!.locked_by).toBeNull();
  });

  it("at most one active job per incident (enqueue is deduped)", async () => {
    const inc = await createIncident({ fingerprint: "fp-dedupe", title: "x" });
    const a = await enqueue(inc.id);
    const b = await enqueue(inc.id);
    expect(b.id).toBe(a.id);
  });

  it("a deterministically-failing step retries with backoff, then escalates after max attempts", async () => {
    // Drive to fix_proposed WITHOUT creating an investigation, so stepFixProposed
    // throws "investigation missing" on every run.
    const inc = await createIncident({ fingerprint: "fp-fail", title: "x" });
    for (const s of ["triaging", "investigating", "fix_proposed"] as const) {
      await transition(inc.id, s, "system");
    }
    const job = await enqueue(inc.id);
    await query("UPDATE jobs SET max_attempts = 2 WHERE id = $1", [job.id]);

    for (let i = 0; i < 4; i++) {
      await drainJobs("worker-fail");
      const j = await jobStatus(job.id);
      if (j.status === "failed") break;
      await query("UPDATE jobs SET run_after = now() WHERE id = $1", [job.id]); // skip backoff
    }

    expect((await jobStatus(job.id)).status).toBe("failed");
    expect((await getIncident(inc.id))!.status).toBe("escalated");
  });
});
