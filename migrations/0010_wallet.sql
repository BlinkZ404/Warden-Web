-- Prepaid wallet for managed inference. Warden runs the models on its own
-- infrastructure and meters each agent run against a prepaid USD balance, so a
-- customer tops up instead of pasting provider keys. Single tenant for now: one
-- wallet row (id = 1). The ledger is the append-only record of top-ups + debits.
--
-- Idempotent / re-runnable.
CREATE TABLE IF NOT EXISTS wallet (
  id          integer PRIMARY KEY DEFAULT 1,
  balance_usd numeric(12,4) NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_singleton CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id            bigserial PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  kind          text NOT NULL,                 -- 'topup' | 'debit'
  amount_usd    numeric(12,4) NOT NULL,        -- positive: top-up, negative: debit
  balance_after numeric(12,4) NOT NULL,
  description   text,
  incident_id   uuid,
  model         text
);

CREATE INDEX IF NOT EXISTS wallet_ledger_created_idx ON wallet_ledger (created_at DESC);
