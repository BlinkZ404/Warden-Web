-- App settings + integration credentials, editable from the Settings UI rather
-- than only env vars. Single key-value store (one tenant for now); the runtime
-- layers these over the ambient environment.
--
-- Idempotent / re-runnable.
CREATE TABLE IF NOT EXISTS settings (
 key text PRIMARY KEY,
 value text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
