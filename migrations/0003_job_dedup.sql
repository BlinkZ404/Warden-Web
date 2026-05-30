-- At most ONE active (queued|running) job per incident. Closes the
-- concurrent-enqueue race and stops reclaimStale from coexisting with a live
-- job for the same incident (defense-in-depth against double-processing).
CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_active_per_incident
  ON jobs (incident_id)
  WHERE status IN ('queued', 'running');
