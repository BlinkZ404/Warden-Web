-- ─────────────────────────────────────────────────────────────────────────────
-- Operational tables that back the runtime but aren't part of the core PLAN §9
-- data model. Kept separate so the §9 schema stays a clean, auditable match to
-- the plan.
-- ─────────────────────────────────────────────────────────────────────────────

-- Lightweight job queue (PLAN §7 "SQS or lightweight job table"). The
-- orchestrator is stateless: a job is just a kick that says "there is automated
-- work to do on this incident". The worker re-reads incident state from the DB,
-- so killing it mid-run loses nothing — the lock expires and the job is
-- re-claimed.
CREATE TABLE IF NOT EXISTS jobs (
  id           bigserial PRIMARY KEY,
  incident_id  uuid NOT NULL REFERENCES incidents(id),
  kind         text NOT NULL DEFAULT 'advance',
  status       text NOT NULL DEFAULT 'queued',   -- queued | running | done | failed
  run_after    timestamptz NOT NULL DEFAULT now(),
  attempts     int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  locked_at    timestamptz,
  locked_by    text,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs (status, run_after);

-- Web-push subscriptions for the mobile approval PWA (PLAN §8/§15).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_id     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
