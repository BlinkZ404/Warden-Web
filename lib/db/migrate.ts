/** Reusable migration runner (used by scripts/migrate.ts and the test harness). */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exec, query, queryOne } from "@/lib/db/client";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "..", "migrations");

export interface MigrateResult {
  applied: string[];
  total: number;
}

export async function runMigrations(
  log: (msg: string) => void = () => {},
): Promise<MigrateResult> {
  await exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied: string[] = [];
  for (const file of files) {
    const already = await queryOne<{ version: string }>(
      "SELECT version FROM schema_migrations WHERE version = $1",
      [file],
    );
    if (already) {
      log(`skip   ${file}`);
      continue;
    }
    log(`apply  ${file}`);
    await exec(readFileSync(join(migrationsDir, file), "utf8"));
    await query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
    applied.push(file);
  }

  const totalRow = await queryOne<{ count: string }>(
    "SELECT count(*)::text AS count FROM schema_migrations",
  );
  return { applied, total: Number(totalRow?.count ?? 0) };
}

/** DANGER: wipes all app data. Used only by the test harness. */
export async function resetDatabase(): Promise<void> {
  await exec(`
    TRUNCATE TABLE
      events, investigations, fix_attempts, reviews, verifications,
      approvals, deployments, outcomes, jobs, push_subscriptions,
      agent_scorecard, incidents, settings, providers,
      wallet, wallet_ledger
    RESTART IDENTITY CASCADE;
  `);
}
