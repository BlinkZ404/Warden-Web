-- Persist the fix patch so the per-incident git workspace is a DERIVED artifact,
-- rebuildable from DB state. Without this, a job reclaimed onto a fresh
-- instance (empty disk) could not reconstruct the fix branch and would escalate
-- instead of resuming — contradicting the stateless/resumable guarantee.
ALTER TABLE fix_attempts ADD COLUMN IF NOT EXISTS diff text;
