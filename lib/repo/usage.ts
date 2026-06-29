/**
 * Usage aggregation for the billing/activity view. Everything here is a count
 * over data the pipeline already records (the append-only `events` log plus the
 * incident and deployment tables); nothing adds instrumentation.
 *
 * Spend is an ESTIMATE, not a metered charge: there is no per-token meter wired
 * yet, so cost is modelled as `agentRuns * RATE_PER_RUN_USD`. The rate is
 * returned alongside the figure so the UI can show the basis rather than imply
 * a precise bill.
 */
import { query, queryOne } from "@/lib/db/client";
import { RATE_PER_RUN_USD } from "@/lib/pricing";

export { RATE_PER_RUN_USD };

export interface ActorUsage {
 actor: string;
 runs: number;
}

export interface TypeUsage {
 type: string;
 count: number;
}

export interface Usage {
 incidents: number;
 resolved: number;
 shipped: number;
 /** Count of `agent_action` events; one per model invocation logged. */
 agentRuns: number;
 /** Total events of every kind (the size of the audit log). */
 events: number;
 byActor: ActorUsage[];
 byType: TypeUsage[];
 ratePerRunUsd: number;
 estCostUsd: number;
}

interface TotalsRow {
 incidents: number;
 resolved: number;
 shipped: number;
 agent_runs: number;
 events: number;
}

export async function computeUsage(): Promise<Usage> {
 // The three reads are independent, so issue them together rather than serially.
 const [totals, byActor, byType] = await Promise.all([
 queryOne<TotalsRow>(`
 SELECT
 (SELECT count(*)::int FROM incidents) AS incidents,
 (SELECT count(*)::int FROM incidents WHERE status = 'resolved') AS resolved,
 (SELECT count(*)::int FROM incidents WHERE status IN ('resolved', 'rolled_back')) AS shipped,
 (SELECT count(*)::int FROM events WHERE type = 'agent_action') AS agent_runs,
 (SELECT count(*)::int FROM events) AS events
 `),
 query<{ actor: string; runs: number }>(
 `SELECT actor, count(*)::int AS runs
 FROM events WHERE type = 'agent_action'
 GROUP BY actor ORDER BY runs DESC`),
 query<{ type: string; count: number }>(
 `SELECT type, count(*)::int AS count
 FROM events GROUP BY type ORDER BY count DESC`),
 ]);
 const t = totals!;

 return {
 incidents: t.incidents,
 resolved: t.resolved,
 shipped: t.shipped,
 agentRuns: t.agent_runs,
 events: t.events,
 byActor,
 byType,
 ratePerRunUsd: RATE_PER_RUN_USD,
 estCostUsd: t.agent_runs * RATE_PER_RUN_USD,
 };
}
