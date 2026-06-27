import { query } from "@/lib/db/client";
import type { AgentScorecard } from "@/lib/db/types";

export type ScorecardDelta = Partial<{
  attempts: number;
  human_approved: number;
  verified_passed: number;
  regressions: number;
}>;

/**
 * Increment an agent's scorecard counters, creating the row on first use.
 * Tracks each agent's accuracy over time (PLAN §3 "memory", §13).
 */
export async function bumpScorecard(
  agent: string,
  role: "fixer" | "reviewer" | "investigator",
  delta: ScorecardDelta,
): Promise<void> {
  await query(
    `INSERT INTO agent_scorecard (agent, role, attempts, human_approved, verified_passed, regressions)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (agent, role) DO UPDATE SET
       attempts        = agent_scorecard.attempts        + EXCLUDED.attempts,
       human_approved  = agent_scorecard.human_approved  + EXCLUDED.human_approved,
       verified_passed = agent_scorecard.verified_passed + EXCLUDED.verified_passed,
       regressions     = agent_scorecard.regressions     + EXCLUDED.regressions,
       updated_at      = now()`,
    [
      agent,
      role,
      delta.attempts ?? 0,
      delta.human_approved ?? 0,
      delta.verified_passed ?? 0,
      delta.regressions ?? 0,
    ],
  );
}

export async function listScorecards(): Promise<AgentScorecard[]> {
  return query<AgentScorecard>(
    "SELECT * FROM agent_scorecard ORDER BY role, agent",
  );
}
