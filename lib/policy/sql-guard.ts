/**
 * Data-mutation safety (PLAN §5.5, §10).
 *
 * In v1, data fixes are HUMAN-ONLY and the orchestrator never runs them
 * autonomously; read-only investigation is the only autonomous DB access. This
 * module is the safety primitive that backs that policy: it statically blocks
 * the dangerous shapes and provides a dry-run (run-in-transaction-then-ROLLBACK)
 * so a proposed write can be shown to a human in plain English with an honest
 * row count before anything is committed.
 *
 * Caveat (per §10): a dry-run still fires triggers/sequences and holds locks;
 * it is "dry-ish", not free. We never auto-approve a write on its basis.
 */
import { getPool } from "@/lib/db/client";

export type StatementKind =
  | "select"
  | "insert"
  | "update"
  | "delete"
  | "ddl"
  | "other";

const DDL_RE = /^(drop|truncate|alter|create|grant|revoke|comment)\b/i;
const WRITE_IN_CTE = /\b(insert|update|delete|merge)\b/i;

/** Remove -- line comments and block comments so they can't hide the real verb. */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** Non-empty statements, splitting on `;` outside single-quoted string literals. */
function splitStatements(sql: string): string[] {
  const noStrings = sql.replace(/'(?:[^']|'')*'/g, "''");
  return noStrings
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function classify(sql: string): StatementKind {
  const s = stripComments(sql).trim();
  if (/^with\b/i.test(s)) {
    // A CTE that contains a write (WITH t AS (DELETE ...)) is a write, not a read.
    return WRITE_IN_CTE.test(s) ? "other" : "select";
  }
  if (/^select\b/i.test(s)) return "select";
  if (/^insert\b/i.test(s)) return "insert";
  if (/^update\b/i.test(s)) return "update";
  if (/^delete\b/i.test(s)) return "delete";
  if (DDL_RE.test(s)) return "ddl";
  return "other";
}

export function hasWhereClause(sql: string): boolean {
  const s = stripComments(sql);
  if (!/\bwhere\b/i.test(s)) return false;
  // A tautological WHERE (1=1 / true) is not a real scope.
  if (/\bwhere\s+(1\s*=\s*1|true)\b/i.test(s)) return false;
  return true;
}

export class BlockedSqlError extends Error {
  constructor(
    public sql: string,
    public reason: string,
  ) {
    super(`Blocked SQL: ${reason}`);
    this.name = "BlockedSqlError";
  }
}

export interface GuardResult {
  allowed: boolean;
  kind: StatementKind;
  reason?: string;
}

/**
 * Decide whether a statement may even be PROPOSED for human review. Always
 * blocks unscoped UPDATE/DELETE and any DDL/DROP/TRUNCATE. A passing result
 * still requires dry-run + human approval + snapshot before execution.
 */
export function guardMutation(sql: string): GuardResult {
  // Fail closed on multiple statements (e.g. `SELECT 1; DELETE FROM orders`).
  if (splitStatements(stripComments(sql)).length > 1) {
    return { allowed: false, kind: "other", reason: "multiple statements are not allowed" };
  }
  const kind = classify(sql);
  if (kind === "select" || kind === "insert") return { allowed: true, kind };
  if (kind === "update" || kind === "delete") {
    if (!hasWhereClause(sql)) {
      return {
        allowed: false,
        kind,
        reason: `unscoped ${kind.toUpperCase()} (no real WHERE clause)`,
      };
    }
    return { allowed: true, kind };
  }
  // DDL and anything unrecognized (comment-prefixed, writable CTE, EXPLAIN/COPY,
  // …) fails CLOSED; only allow-listed shapes pass.
  return {
    allowed: false,
    kind,
    reason:
      kind === "ddl"
        ? "DDL / DROP / TRUNCATE is never auto-run"
        : "unrecognized or non-allow-listed statement shape",
  };
}

export function assertProposable(sql: string): GuardResult {
  const r = guardMutation(sql);
  if (!r.allowed) throw new BlockedSqlError(sql, r.reason!);
  return r;
}

export interface DryRunResult {
  kind: StatementKind;
  rowcount: number;
  plan: string[];
  exceededThreshold: boolean;
}

/**
 * Execute a proposed write inside a transaction and ROLLBACK, capturing the
 * affected row count and query plan without persisting anything.
 */
export async function dryRunMutation(
  sql: string,
  params: unknown[] = [],
  opts: { maxRows?: number } = {},
): Promise<DryRunResult> {
  const guard = assertProposable(sql);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '5s'");
    const planRes = await client.query(`EXPLAIN ${sql}`, params as never);
    const plan = planRes.rows.map((r) => String(r["QUERY PLAN"]));
    const res = await client.query(sql, params as never);
    await client.query("ROLLBACK");
    const rowcount = res.rowCount ?? 0;
    const maxRows = opts.maxRows ?? 100;
    return {
      kind: guard.kind,
      rowcount,
      plan,
      exceededThreshold: rowcount > maxRows,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
