-- One review row per (fix attempt, reviewer); makes the reviewer-panel
-- idempotency a DB invariant, not just an in-memory check. A stale-lease
-- double-run (or any retry) can no longer insert duplicate review rows that
-- would corrupt consensus counts (and, under a relaxed quorum, flip
-- escalate→proceed). getReviewers() already assigns distinct names per panel
-- member, so this is safe.
CREATE UNIQUE INDEX IF NOT EXISTS reviews_attempt_reviewer_uniq
  ON reviews (fix_attempt_id, reviewer_agent);
