/**
 * Prepaid wallet for managed inference (migration 0010). One singleton balance
 * (id = 1) plus an append-only ledger of top-ups and per-run debits. Single
 * tenant for now; a multi-tenant build keys both tables by account id.
 *
 * Money is stored as numeric and read back as float8 so callers get plain
 * numbers, never pg's stringified numeric.
 */
import { query, queryOne } from "@/lib/db/client";
import { STARTING_BALANCE_USD } from "@/lib/pricing";

export interface LedgerEntry {
  id: string;
  created_at: string;
  kind: "topup" | "debit";
  amount_usd: number;
  balance_after: number;
  description: string | null;
  incident_id: string | null;
  model: string | null;
}

export async function getBalance(): Promise<number> {
  // Read-only on the hot path. Only the very first read (no wallet row yet) seeds
  // the singleton with the free starting credit; every later read is a plain SELECT.
  const row = await queryOne<{ balance: number }>(
    "SELECT balance_usd::float8 AS balance FROM wallet WHERE id = 1",
  );
  if (row) return row.balance;
  await query(`INSERT INTO wallet (id, balance_usd) VALUES (1, $1) ON CONFLICT (id) DO NOTHING`, [
    STARTING_BALANCE_USD,
  ]);
  return STARTING_BALANCE_USD;
}

interface Move {
  description?: string;
  incidentId?: string | null;
  model?: string | null;
}

/** Apply a signed delta and record the ledger row in ONE atomic statement, so a
 *  crash can never move the balance without its ledger entry. Returns the new
 *  balance. Positive = top-up, negative = debit. Seeds (starting credit + delta)
 *  on first use, else adds the delta to the existing balance. */
async function move(kind: "topup" | "debit", delta: number, m: Move): Promise<number> {
  const row = await queryOne<{ balance: number }>(
    `WITH w AS (
       INSERT INTO wallet (id, balance_usd) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET balance_usd = wallet.balance_usd + $2, updated_at = now()
       RETURNING balance_usd
     ), led AS (
       INSERT INTO wallet_ledger (kind, amount_usd, balance_after, description, incident_id, model)
       SELECT $3, $2, balance_usd, $4, $5, $6 FROM w
     )
     SELECT balance_usd::float8 AS balance FROM w`,
    [
      STARTING_BALANCE_USD + delta,
      delta,
      kind,
      m.description ?? null,
      m.incidentId ?? null,
      m.model ?? null,
    ],
  );
  return row?.balance ?? 0;
}

/** Add funds. Amount must be positive. */
export async function topUp(amountUsd: number, description = "Top-up"): Promise<number> {
  return move("topup", Math.abs(amountUsd), { description });
}

/** Charge a metered run. Amount must be positive (recorded as a negative delta). */
export async function debit(amountUsd: number, m: Move): Promise<number> {
  return move("debit", -Math.abs(amountUsd), m);
}

export async function listLedger(limit = 30): Promise<LedgerEntry[]> {
  return query<LedgerEntry>(
    `SELECT id::text, created_at, kind, amount_usd::float8 AS amount_usd,
            balance_after::float8 AS balance_after, description, incident_id::text, model
       FROM wallet_ledger ORDER BY id DESC LIMIT $1`,
    [limit],
  );
}

/** Total spent (sum of debits): the period's metered usage. */
export async function totalSpent(): Promise<number> {
  const row = await queryOne<{ spent: number }>(
    `SELECT COALESCE(-SUM(amount_usd), 0)::float8 AS spent
       FROM wallet_ledger WHERE kind = 'debit'`,
  );
  return row?.spent ?? 0;
}
