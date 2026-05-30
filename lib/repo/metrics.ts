/**
 * Derived accuracy & outcome metrics (BUSINESS-PLAN §10; PLAN §13).
 *
 * Two levels, deliberately kept distinct:
 *
 *  1. Per-agent ACCURACY (from `agent_scorecard`). The counters are raw; the
 *     *rates* are derived here. Crucially these are anchored to the deterministic
 *     verification gate and production health — NOT an agent rating its own work.
 *     The bumps credit `verified_passed`/`human_approved`/`regressions` to the
 *     FIXER (`fa.agent`); a reviewer row only ever accrues `attempts`. So the
 *     fixer-style rates are computed for `role='fixer'` ONLY — emitting a
 *     "0% verified" for a reviewer would be a measurement artifact, not a fact.
 *
 *  2. Fleet / PMF rates (from the append-only `events` log + the artifact tables)
 *     — approval rate, autonomous-resolution rate, post-ship revert rate, and the
 *     detection→verified latency. All are aggregations over data the pipeline
 *     already records; nothing here adds instrumentation.
 */
import { query, queryOne } from "@/lib/db/client";

/** Rate as a 0..1 fraction, or null when the denominator is 0 (no signal yet). */
export function safeRate(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

/**
 * §10 kill-switch: a post-ship revert rate at or below this is healthy; above
 * it is the "stop expanding fix scope" signal. The threshold is a policy number,
 * so it lives here in the data layer — the dashboard renders the derived
 * `revertWithinCeiling` boolean, not the bare number.
 */
export const REVERT_RATE_CEILING = 0.05;

export interface FleetMetrics {
  totalIncidents: number;
  resolved: number;
  /** Distinct incidents that reached `awaiting_approval` (the gate passed). */
  reachedApproval: number;
  /** Distinct incidents that reached `escalated`. */
  escalated: number;
  /** Deployments promoted to production. */
  shipped: number;
  /** Promoted deployments later reverted (auto-rollback OR human one-tap). */
  reverted: number;
  /** Distinct incidents a human approved. */
  approved: number;
  /** approved / reachedApproval — would a founder ship what Warden proposes? */
  approvalRate: number | null;
  /** reachedApproval / (reached ∪ escalated) — share auto-handled vs escalated. */
  autonomyRate: number | null;
  /** reverted / shipped — the kill-switch metric. */
  revertRate: number | null;
  /** revertRate <= REVERT_RATE_CEILING; null when nothing has shipped yet. */
  revertWithinCeiling: boolean | null;
  /** Mean seconds from incident detected to the first passing gate (latency). */
  timeToVerifiedSec: number | null;
}

export interface AgentAccuracy {
  agent: string;
  role: string;
  attempts: number;
  verified_passed: number;
  human_approved: number;
  regressions: number;
  /** verified / attempts — fixer only (null for reviewers; see module note). */
  verifyRate: number | null;
  /** approved / verified — fixer only. */
  approvalRate: number | null;
  /** regressions / approved — fixer only. */
  regressionRate: number | null;
}

export interface Metrics {
  fleet: FleetMetrics;
  agents: AgentAccuracy[];
}

interface FleetRow {
  total_incidents: number;
  resolved: number;
  reached_approval: number;
  escalated: number;
  decided: number;
  approved: number;
  shipped: number;
  reverted: number;
  time_to_verified_sec: number | null;
}

export async function computeMetrics(): Promise<Metrics> {
  // The fleet aggregation and the per-agent scorecard read hit different tables
  // and are independent, so issue them together (the scorecard query runs while
  // the fleet query is awaited). Counts are ::int (node-pg → number); the latency
  // is ::float8 (a JS number, or null when nothing has verified yet).
  const agentRows = query<{
    agent: string;
    role: string;
    attempts: number;
    verified_passed: number;
    human_approved: number;
    regressions: number;
  }>(
    `SELECT agent, role, attempts, verified_passed, human_approved, regressions
       FROM agent_scorecard ORDER BY role, agent`,
  );
  const f = (await queryOne<FleetRow>(`
    SELECT
      (SELECT count(*)::int FROM incidents)                                    AS total_incidents,
      (SELECT count(*)::int FROM incidents WHERE status = 'resolved')          AS resolved,
      (SELECT count(DISTINCT incident_id)::int FROM events
         WHERE type = 'state_change' AND payload->>'to' = 'awaiting_approval') AS reached_approval,
      (SELECT count(DISTINCT incident_id)::int FROM events
         WHERE type = 'state_change' AND payload->>'to' = 'escalated')         AS escalated,
      (SELECT count(DISTINCT incident_id)::int FROM events
         WHERE type = 'state_change'
           AND payload->>'to' IN ('awaiting_approval', 'escalated'))           AS decided,
      (SELECT count(DISTINCT incident_id)::int FROM approvals
         WHERE decision = 'approve')                                           AS approved,
      (SELECT count(*)::int FROM deployments WHERE promoted_at IS NOT NULL)    AS shipped,
      (SELECT count(*)::int FROM deployments WHERE rolled_back)                AS reverted,
      (SELECT (avg(extract(epoch FROM (fp.passed_at - i.created_at))))::float8
         FROM (
           SELECT fa.incident_id, min(v.checked_at) AS passed_at
           FROM verifications v
           JOIN fix_attempts fa ON fa.id = v.fix_attempt_id
           WHERE v.test_passed AND NOT v.error_recurred
           GROUP BY fa.incident_id
         ) fp
         JOIN incidents i ON i.id = fp.incident_id)                           AS time_to_verified_sec
  `))!;

  const revertRate = safeRate(f.reverted, f.shipped);
  const fleet: FleetMetrics = {
    totalIncidents: f.total_incidents,
    resolved: f.resolved,
    reachedApproval: f.reached_approval,
    escalated: f.escalated,
    shipped: f.shipped,
    reverted: f.reverted,
    approved: f.approved,
    approvalRate: safeRate(f.approved, f.reached_approval),
    autonomyRate: safeRate(f.reached_approval, f.decided),
    revertRate,
    revertWithinCeiling: revertRate == null ? null : revertRate <= REVERT_RATE_CEILING,
    timeToVerifiedSec: f.time_to_verified_sec,
  };

  const rows = await agentRows;

  const agents: AgentAccuracy[] = rows.map((r) => {
    // Reviewers only accrue `attempts`; their verified/approved/regression
    // counters are structurally 0, so a rate would read a false "0%". Compute
    // the fixer-style rates for the fixer role only.
    const isFixer = r.role === "fixer";
    return {
      ...r,
      verifyRate: isFixer ? safeRate(r.verified_passed, r.attempts) : null,
      approvalRate: isFixer ? safeRate(r.human_approved, r.verified_passed) : null,
      regressionRate: isFixer ? safeRate(r.regressions, r.human_approved) : null,
    };
  });

  return { fleet, agents };
}
