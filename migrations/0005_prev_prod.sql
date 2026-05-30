-- Record the previous-good production deployment captured before a promotion,
-- so a rollback restores production TO it (not to the just-shipped bad
-- deployment). Closes the live rollback-target defect (audit H10).
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS prev_prod_deployment_id text;
