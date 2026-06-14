/** TypeScript row shapes mirroring the PLAN §9 schema (+ runtime tables). */

export type IncidentStatus =
  | "detected"
  | "triaging"
  | "investigating"
  | "fix_proposed"
  | "under_review"
  | "verifying"
  | "awaiting_approval"
  | "approved"
  | "deploying"
  | "verifying_prod"
  | "resolved"
  | "failed"
  | "rolled_back"
  | "escalated"
  | "dismissed";

export type ReviewVerdict = "approve" | "reject" | "uncertain";

export interface Incident {
  id: string;
  source: string;
  external_id: string | null;
  fingerprint: string;
  title: string;
  service: string | null;
  severity: string | null;
  status: IncidentStatus;
  embedding: string | null; // pgvector literal, e.g. "[0.1,0.2,...]"
  first_seen: Date | null;
  last_seen: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface EventRow {
  id: string; // bigserial -> string
  incident_id: string;
  type: string;
  actor: string;
  payload: Record<string, unknown>;
  created_at: Date;
}

export interface Investigation {
  id: string;
  incident_id: string;
  root_cause: string | null;
  confidence: number | null;
  context: Record<string, unknown> | null;
  created_at: Date;
}

export interface FixAttempt {
  id: string;
  incident_id: string;
  agent: string;
  branch: string | null;
  commit_sha: string | null;
  diff_summary: string | null;
  files_changed: unknown | null;
  status: string;
  diff: string | null; // unified patch (main..branch); lets the workspace be rebuilt
  created_at: Date;
}

export interface Review {
  id: string;
  fix_attempt_id: string;
  reviewer_agent: string;
  verdict: ReviewVerdict;
  findings: Record<string, unknown> | null;
  created_at: Date;
}

export interface Verification {
  id: string;
  fix_attempt_id: string;
  preview_url: string | null;
  test_passed: boolean | null;
  error_recurred: boolean | null;
  new_errors: unknown | null;
  checked_at: Date;
}

export interface Approval {
  id: string;
  incident_id: string;
  fix_attempt_id: string;
  decision: "approve" | "reject";
  decided_by: string;
  channel: string | null;
  decided_at: Date;
}

export interface Deployment {
  id: string;
  fix_attempt_id: string;
  provider: string;
  deployment_id: string | null;
  preview_url: string | null;
  prod_url: string | null;
  promoted_at: Date | null;
  rolled_back: boolean;
  rolled_back_at: Date | null;
  prev_prod_deployment_id: string | null;
  /** The commit the deployment was built from; must equal the verified SHA. */
  built_commit_sha: string | null;
}

export interface Outcome {
  id: string;
  incident_id: string;
  resolved: boolean | null;
  recurred: boolean | null;
  resolution_type: string | null;
  notes: string | null;
  closed_at: Date | null;
}

export interface AgentScorecard {
  id: string;
  agent: string;
  role: string;
  attempts: number;
  human_approved: number;
  verified_passed: number;
  regressions: number;
  updated_at: Date;
}

export interface Job {
  id: string;
  incident_id: string;
  kind: string;
  status: "queued" | "running" | "done" | "failed";
  run_after: Date;
  attempts: number;
  max_attempts: number;
  locked_at: Date | null;
  locked_by: string | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_id: string | null;
  created_at: Date;
}
