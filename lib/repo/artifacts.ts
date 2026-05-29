/** Repository functions for the per-incident pipeline artifacts. */
import { query, queryOne } from "@/lib/db/client";
import type {
  Investigation,
  FixAttempt,
  Review,
  ReviewVerdict,
  Verification,
  Approval,
  Deployment,
  Outcome,
} from "@/lib/db/types";

// ── investigations ──────────────────────────────────────────────────────────
export async function createInvestigation(input: {
  incident_id: string;
  root_cause: string;
  confidence: number;
  context: Record<string, unknown>;
}): Promise<Investigation> {
  return (await queryOne<Investigation>(
    `INSERT INTO investigations (incident_id, root_cause, confidence, context)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [input.incident_id, input.root_cause, input.confidence, input.context],
  ))!;
}

export async function latestInvestigation(
  incidentId: string,
): Promise<Investigation | null> {
  return queryOne<Investigation>(
    "SELECT * FROM investigations WHERE incident_id = $1 ORDER BY created_at DESC LIMIT 1",
    [incidentId],
  );
}

// ── fix_attempts ──────────────────────────────────────────────────────────--
export async function createFixAttempt(input: {
  incident_id: string;
  agent?: string;
  branch: string;
  commit_sha: string;
  diff_summary: string;
  files_changed: unknown;
  status?: string;
}): Promise<FixAttempt> {
  return (await queryOne<FixAttempt>(
    `INSERT INTO fix_attempts
       (incident_id, agent, branch, commit_sha, diff_summary, files_changed, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      input.incident_id,
      input.agent ?? "claude",
      input.branch,
      input.commit_sha,
      input.diff_summary,
      JSON.stringify(input.files_changed),
      input.status ?? "open",
    ],
  ))!;
}

export async function latestFixAttempt(
  incidentId: string,
): Promise<FixAttempt | null> {
  return queryOne<FixAttempt>(
    "SELECT * FROM fix_attempts WHERE incident_id = $1 ORDER BY created_at DESC LIMIT 1",
    [incidentId],
  );
}

export async function setFixAttemptStatus(
  id: string,
  status: string,
): Promise<void> {
  await query("UPDATE fix_attempts SET status = $2 WHERE id = $1", [id, status]);
}

// ── reviews ──────────────────────────────────────────────────────────────--
export async function createReview(input: {
  fix_attempt_id: string;
  reviewer_agent?: string;
  verdict: ReviewVerdict;
  findings: object; // serialized to jsonb; ReviewFindings or any object bag
}): Promise<Review> {
  return (await queryOne<Review>(
    `INSERT INTO reviews (fix_attempt_id, reviewer_agent, verdict, findings)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [
      input.fix_attempt_id,
      input.reviewer_agent ?? "codex",
      input.verdict,
      input.findings,
    ],
  ))!;
}

export async function latestReview(
  fixAttemptId: string,
): Promise<Review | null> {
  return queryOne<Review>(
    "SELECT * FROM reviews WHERE fix_attempt_id = $1 ORDER BY created_at DESC LIMIT 1",
    [fixAttemptId],
  );
}

// ── verifications ──────────────────────────────────────────────────────────
export async function createVerification(input: {
  fix_attempt_id: string;
  preview_url: string | null;
  test_passed: boolean;
  error_recurred: boolean;
  new_errors: unknown;
}): Promise<Verification> {
  return (await queryOne<Verification>(
    `INSERT INTO verifications
       (fix_attempt_id, preview_url, test_passed, error_recurred, new_errors)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [
      input.fix_attempt_id,
      input.preview_url,
      input.test_passed,
      input.error_recurred,
      JSON.stringify(input.new_errors),
    ],
  ))!;
}

export async function latestVerification(
  fixAttemptId: string,
): Promise<Verification | null> {
  return queryOne<Verification>(
    "SELECT * FROM verifications WHERE fix_attempt_id = $1 ORDER BY checked_at DESC LIMIT 1",
    [fixAttemptId],
  );
}

// ── approvals ──────────────────────────────────────────────────────────────
export async function createApproval(input: {
  incident_id: string;
  fix_attempt_id: string;
  decision: "approve" | "reject";
  decided_by: string;
  channel: string;
}): Promise<Approval> {
  return (await queryOne<Approval>(
    `INSERT INTO approvals (incident_id, fix_attempt_id, decision, decided_by, channel)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [
      input.incident_id,
      input.fix_attempt_id,
      input.decision,
      input.decided_by,
      input.channel,
    ],
  ))!;
}

/** The decision for an incident, if a human has made one (PLAN §5.1 gate). */
export async function latestApproval(
  incidentId: string,
): Promise<Approval | null> {
  return queryOne<Approval>(
    "SELECT * FROM approvals WHERE incident_id = $1 ORDER BY decided_at DESC LIMIT 1",
    [incidentId],
  );
}

// ── deployments ──────────────────────────────────────────────────────────--
export async function createDeployment(input: {
  fix_attempt_id: string;
  provider?: string;
  deployment_id: string;
  preview_url: string | null;
  prod_url: string | null;
  promoted_at?: Date | null;
}): Promise<Deployment> {
  return (await queryOne<Deployment>(
    `INSERT INTO deployments
       (fix_attempt_id, provider, deployment_id, preview_url, prod_url, promoted_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [
      input.fix_attempt_id,
      input.provider ?? "vercel",
      input.deployment_id,
      input.preview_url,
      input.prod_url,
      input.promoted_at ?? null,
    ],
  ))!;
}

export async function markDeploymentPromoted(
  id: string,
  prodUrl: string,
): Promise<void> {
  await query(
    "UPDATE deployments SET prod_url = $2, promoted_at = now() WHERE id = $1",
    [id, prodUrl],
  );
}

export async function markDeploymentRolledBack(id: string): Promise<void> {
  await query(
    "UPDATE deployments SET rolled_back = true, rolled_back_at = now() WHERE id = $1",
    [id],
  );
}

export async function latestDeployment(
  fixAttemptId: string,
): Promise<Deployment | null> {
  return queryOne<Deployment>(
    "SELECT * FROM deployments WHERE fix_attempt_id = $1 ORDER BY id DESC LIMIT 1",
    [fixAttemptId],
  );
}

// ── outcomes ──────────────────────────────────────────────────────────────-
export async function recordOutcome(input: {
  incident_id: string;
  resolved: boolean;
  recurred: boolean;
  resolution_type: string;
  notes: string;
}): Promise<Outcome> {
  return (await queryOne<Outcome>(
    `INSERT INTO outcomes (incident_id, resolved, recurred, resolution_type, notes, closed_at)
     VALUES ($1,$2,$3,$4,$5, now()) RETURNING *`,
    [
      input.incident_id,
      input.resolved,
      input.recurred,
      input.resolution_type,
      input.notes,
    ],
  ))!;
}

export async function getOutcome(incidentId: string): Promise<Outcome | null> {
  return queryOne<Outcome>(
    "SELECT * FROM outcomes WHERE incident_id = $1 ORDER BY closed_at DESC NULLS LAST LIMIT 1",
    [incidentId],
  );
}
