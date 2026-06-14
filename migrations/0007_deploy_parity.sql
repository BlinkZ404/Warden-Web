-- Deploy parity (AUDIT C1): record the commit SHA the deployment was actually
-- built from, so the orchestrator can assert it matches the VERIFIED fix commit
-- before promoting to production. We never ship bytes we didn't verify.
--
-- Idempotent / re-runnable.
ALTER TABLE deployments
 ADD COLUMN IF NOT EXISTS built_commit_sha text;
