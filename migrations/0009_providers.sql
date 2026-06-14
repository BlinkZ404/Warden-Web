-- Reusable model connections (OpenAI-compatible providers the user adds once and
-- assigns to roles; Fixer, Reviewer 1..3, Investigator; by id in `settings`).
--
-- Idempotent / re-runnable.
CREATE TABLE IF NOT EXISTS providers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 label text NOT NULL,
 base_url text,
 api_key text,
 model text,
 created_at timestamptz NOT NULL DEFAULT now()
);
