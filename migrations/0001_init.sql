-- ─────────────────────────────────────────────────────────────────────────────
-- Warden core schema (PLAN §9).
--
-- This is the deliberate state machine + append-only event log + pgvector
-- incident memory that the whole product is built around. It runs identically
-- on the local Docker pgvector image and on Amazon Aurora PostgreSQL (Serverless
-- v2) in production.
--
-- Idempotent / re-runnable: safe to apply repeatedly (CREATE ... IF NOT EXISTS
-- and guarded enum creation), so an interrupted migration can simply be retried.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS vector;    -- pgvector: incident memory

-- enums ----------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE incident_status AS ENUM (
    'detected','triaging','investigating','fix_proposed','under_review',
    'verifying','awaiting_approval','approved','deploying','verifying_prod',
    'resolved','failed','rolled_back','escalated','dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE review_verdict AS ENUM ('approve','reject','uncertain');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- incidents ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incidents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source        text NOT NULL DEFAULT 'sentry',
  external_id   text,                          -- e.g. Sentry issue id
  fingerprint   text NOT NULL,                 -- for de-duplication
  title         text NOT NULL,
  service       text,
  severity      text,
  status        incident_status NOT NULL DEFAULT 'detected',
  embedding     vector(1536),                  -- pgvector: "have we seen this?"
  first_seen    timestamptz,
  last_seen     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One OPEN incident per fingerprint. Resolved/dismissed/failed incidents drop
-- out of the unique constraint so a recurrence opens a fresh incident.
CREATE UNIQUE INDEX IF NOT EXISTS incidents_active_fingerprint_uniq
  ON incidents (fingerprint)
  WHERE status NOT IN ('resolved','dismissed','failed');

-- Approximate-nearest-neighbour index for incident memory (cosine distance).
CREATE INDEX IF NOT EXISTS incidents_embedding_hnsw
  ON incidents USING hnsw (embedding vector_cosine_ops);

-- append-only audit / event log: the source of truth for "what happened" ------
CREATE TABLE IF NOT EXISTS events (
  id           bigserial PRIMARY KEY,
  incident_id  uuid NOT NULL REFERENCES incidents(id),
  type         text NOT NULL,                  -- 'state_change','agent_action','approval',...
  actor        text NOT NULL,                  -- 'system' | 'claude' | 'codex' | 'human:<id>'
  payload      jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_incident_created_idx ON events (incident_id, created_at);

CREATE TABLE IF NOT EXISTS investigations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id  uuid NOT NULL REFERENCES incidents(id),
  root_cause   text,
  confidence   real,
  context      jsonb,                          -- traces/logs pulled via Sentry MCP
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fix_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id   uuid NOT NULL REFERENCES incidents(id),
  agent         text NOT NULL DEFAULT 'claude',
  branch        text,
  commit_sha    text,
  diff_summary  text,                          -- plain-English summary for the founder
  files_changed jsonb,
  status        text NOT NULL DEFAULT 'open',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fix_attempt_id uuid NOT NULL REFERENCES fix_attempts(id),
  reviewer_agent text NOT NULL DEFAULT 'codex',
  verdict        review_verdict NOT NULL,
  findings       jsonb,                         -- incl. git-history checks
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- deterministic gate results; this, not the agents, decides safety -----------
CREATE TABLE IF NOT EXISTS verifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fix_attempt_id uuid NOT NULL REFERENCES fix_attempts(id),
  preview_url    text,
  test_passed    boolean,
  error_recurred boolean,                       -- did the original error reappear?
  new_errors     jsonb,
  checked_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approvals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id    uuid NOT NULL REFERENCES incidents(id),
  fix_attempt_id uuid NOT NULL REFERENCES fix_attempts(id),
  decision       text NOT NULL,                 -- 'approve' | 'reject'
  decided_by     text NOT NULL,                 -- user id
  channel        text,                          -- 'push' | 'web' | 'slack'
  decided_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deployments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fix_attempt_id uuid NOT NULL REFERENCES fix_attempts(id),
  provider       text NOT NULL DEFAULT 'vercel',
  deployment_id  text,
  preview_url    text,
  prod_url       text,
  promoted_at    timestamptz,
  rolled_back    boolean NOT NULL DEFAULT false,
  rolled_back_at timestamptz
);

CREATE TABLE IF NOT EXISTS outcomes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id     uuid NOT NULL REFERENCES incidents(id),
  resolved        boolean,
  recurred        boolean,
  resolution_type text,                         -- 'code' | 'data' | 'none'
  notes           text,
  closed_at       timestamptz
);

CREATE TABLE IF NOT EXISTS agent_scorecard (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent           text NOT NULL,
  role            text NOT NULL,                -- 'fixer' | 'reviewer'
  attempts        int NOT NULL DEFAULT 0,
  human_approved  int NOT NULL DEFAULT 0,
  verified_passed int NOT NULL DEFAULT 0,
  regressions     int NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One scorecard row per (agent, role).
CREATE UNIQUE INDEX IF NOT EXISTS agent_scorecard_agent_role_uniq
  ON agent_scorecard (agent, role);
