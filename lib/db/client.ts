/**
 * Thin Postgres access layer.
 *
 * The whole app talks to Postgres through this one module so that local dev
 * (Docker pgvector) and production (Amazon Aurora PostgreSQL Serverless v2)
 * differ only by DATABASE_URL. No ORM; the schema is the product (PLAN §9), so
 * we keep the SQL visible.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { config } from "@/lib/config";

const { Pool } = pg;

// pgvector returns `vector` columns as strings like "[0.1,0.2,...]". We mostly
// don't read embeddings back into JS, but register a no-op parser so it stays a
// string rather than throwing. (OID 16385+ is dynamic; handled at query sites.)

let pool: pg.Pool | null = null;

function isLocalHost(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return false; // unparseable → treat as remote (secure)
  }
}

/**
 * The vendored Amazon RDS global CA bundle, loaded once. Aurora's server
 * certificate is signed by the Amazon RDS private CA, which is NOT in Node's
 * default (Mozilla) trust store, so verifying against system CAs would fail with
 * "unable to verify the first certificate". Shipping the public RDS bundle lets
 * the default remote path verify the chain instead of failing to connect.
 */
let rdsCa: string | null | undefined;
function bundledRdsCa(): string | null {
  if (rdsCa === undefined) {
    try {
      rdsCa = readFileSync(resolve(process.cwd(), "certs", "rds-global-bundle.pem"), "utf8");
    } catch {
      rdsCa = null; // bundle missing → fall back to encrypt-but-don't-verify
    }
  }
  return rdsCa;
}

/**
 * TLS config for the pool. Secure by default for remote hosts (Aurora):
 *   - PGSSL=disable                  → no TLS (local only)
 *   - localhost/127.0.0.1/::1        → no TLS (local dev)
 *   - PGSSLMODE=verify-ca|verify-full + PGSSLROOTCERT → verify against that CA
 *     (an operator-supplied RDS CA bundle)
 *   - PGSSL_INSECURE=1               → explicit opt-out (encrypt, don't verify)
 *   - otherwise (remote)             → verify against the vendored RDS CA bundle
 *     (or encrypt-but-don't-verify if that bundle is somehow absent)
 */
function resolveSsl(url: string): pg.PoolConfig["ssl"] {
  if (process.env.PGSSL === "disable" || isLocalHost(url)) return undefined;
  const mode = process.env.PGSSLMODE;
  const caPath = process.env.PGSSLROOTCERT;
  if ((mode === "verify-ca" || mode === "verify-full") && caPath) {
    return { rejectUnauthorized: true, ca: readFileSync(caPath, "utf8") };
  }
  if (process.env.PGSSL_INSECURE === "1") return { rejectUnauthorized: false };
  const ca = bundledRdsCa();
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: false };
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      ssl: resolveSsl(config.databaseUrl),
    });
    pool.on("error", (err) => {
      // A pooled idle client errored; log and let pg recycle it.
      console.error("[db] idle client error:", err.message);
    });
  }
  return pool;
}

/** Run a query and return rows (typed by the caller). */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await getPool().query(text, params as never);
  return res.rows as T[];
}

/** Run a query expected to return at most one row. */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Execute raw SQL (possibly multiple statements). Used by the migration runner. */
export async function exec(sql: string): Promise<void> {
  await getPool().query(sql);
}

/**
 * Run `fn` inside a transaction. Commits on success, rolls back on throw.
 * Used for atomic state transitions and for data-mutation DRY RUNS (PLAN §10):
 * the proposed write runs here and we ROLLBACK regardless to capture its effect
 * without persisting it.
 */
export async function withTransaction<T>(
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run a query under a READ-ONLY session (PLAN §5.6, §6: the investigation agent
 * connects with no write authority). Any INSERT/UPDATE/DELETE issued here throws
 * "cannot execute ... in a read-only transaction": a real, demonstrable guard,
 * not a convention. In production this is backed by a dedicated read-only DB
 * role; here we enforce it at the session level so the guarantee holds locally.
 */
export async function readOnlyQuery<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    // Scope read-only to a transaction so it auto-clears on COMMIT; otherwise
    // a session-level flag would leak back into the pool and poison later
    // writes on the same connection.
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");
    const res = await client.query(text, params as never);
    await client.query("COMMIT");
    return res.rows as T[];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
