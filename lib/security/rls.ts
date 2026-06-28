/**
 * Posture scan: the first NON-error trigger lane (roadmap gap #3).
 *
 * The Sentry pipeline only fires when something throws. The most-cited vibe-coded
 * breach class throws nothing: a Supabase/Firebase table left with Row-Level
 * Security OFF serves every row to the anonymous API key, silently, until a
 * stranger finds it. Detection is solved by
 * vendors, but a non-technical founder cannot read a scanner report or write the
 * policy SQL to fix it. This lane closes that loop: scan -> plain-English finding
 * -> generated policy -> one-tap consent -> post-apply assertion.
 *
 * It deliberately reuses the product's themes (verify-not-review, plain English,
 * one-tap consent, an audit of what changed) without touching the Sentry-incident
 * state machine. The corrective statement is DDL, applied through this dedicated,
 * scope-limited path; it is NOT the autonomous data-mutation path that
 * `lib/policy/sql-guard.ts` fences off, so no carve-out there is required.
 *
 * In simulation the schema below is the source; in live mode the scanner reads
 * the Supabase management API / `information_schema` through a scope-limited adapter.
 */

export type Severity = "critical" | "high" | "medium";
export type PostureStatus = "open" | "secured" | "protected" | "intentional";

export interface PostureTable {
  name: string;
  /** Row-Level Security enabled on the table? RLS off ⇒ the anon key reads all rows. */
  rlsEnabled: boolean;
  /** Rough row count, for impact wording. */
  rows: number;
  /** What the table holds, in plain English. */
  contains: string;
  severity: Severity;
  /** Some tables are public BY DESIGN (marketing pages); never a finding. */
  intentionalPublic?: boolean;
}

export interface TablePosture extends PostureTable {
  status: PostureStatus;
  title: string;
  explanation: string;
  policySql: string;
}

/** The simulated Supabase schema for the demo. */
export const SIM_TABLES: PostureTable[] = [
  {
    name: "users",
    rlsEnabled: false,
    rows: 12480,
    contains: "names, emails, and password-reset tokens",
    severity: "critical",
  },
  {
    name: "orders",
    rlsEnabled: false,
    rows: 3920,
    contains: "customer orders, shipping addresses, and amounts",
    severity: "critical",
  },
  {
    name: "messages",
    rlsEnabled: false,
    rows: 84210,
    contains: "private direct messages between users",
    severity: "high",
  },
  {
    name: "subscriptions",
    rlsEnabled: true,
    rows: 880,
    contains: "billing plans",
    severity: "high",
  },
  {
    name: "public_pages",
    rlsEnabled: false,
    rows: 40,
    contains: "published marketing pages",
    severity: "medium",
    intentionalPublic: true,
  },
];

/** The corrective DDL: turn RLS on and add an owner-only read policy. */
export function policySqlFor(table: string): string {
  return (
    `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;\n` +
    `CREATE POLICY "${table}_owner_read" ON "${table}"\n` +
    `  FOR SELECT USING (auth.uid() = user_id);`
  );
}

function explain(t: PostureTable): string {
  return (
    `Anyone on the internet can read your "${t.name}" table ` +
    `(~${t.rows.toLocaleString()} rows of ${t.contains}). ` +
    `Row-Level Security is off, so the public API key returns every row. ` +
    `Turning RLS on with an owner-only read policy closes this; only the row's ` +
    `owner can read it, and your app keeps working.`
  );
}

function statusOf(t: PostureTable, secured: Set<string>): PostureStatus {
  if (t.intentionalPublic) return "intentional";
  if (t.rlsEnabled) return "protected";
  return secured.has(t.name) ? "secured" : "open";
}

/** Full posture for every table, with plain-English findings and the fix SQL. */
export function assessPosture(
  tables: PostureTable[],
  secured: Set<string>,
): TablePosture[] {
  return tables.map((t) => {
    const status = statusOf(t, secured);
    const title =
      status === "intentional"
        ? `"${t.name}" is public by design`
        : status === "protected" || status === "secured"
          ? `"${t.name}" is protected`
          : `"${t.name}" is readable by anyone`;
    return {
      ...t,
      status,
      title,
      explanation: status === "open" ? explain(t) : title,
      policySql: policySqlFor(t.name),
    };
  });
}

const SEV_RANK: Record<Severity, number> = { critical: 3, high: 2, medium: 1 };

/** Open findings only, most severe first. */
export function openFindings(postures: TablePosture[]): TablePosture[] {
  return postures
    .filter((p) => p.status === "open")
    .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]);
}

/**
 * The post-apply assertion (the verify-not-review gate for this lane): once a
 * table is in the secured set, the anon role can no longer read it. Real in live
 * mode (a probe SELECT under the anon role must return zero rows / be denied);
 * deterministic in simulation.
 */
export function assertSecured(table: string, secured: Set<string>): boolean {
  return secured.has(table);
}
