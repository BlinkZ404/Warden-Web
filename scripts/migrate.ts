/**
 * Migration runner CLI. Applies every migrations/*.sql file once, in order.
 * Idempotent: safe to retry after an interrupted run.
 *
 *   npm run migrate
 */
import { runMigrations } from "@/lib/db/migrate";
import { closePool } from "@/lib/db/client";
import { config } from "@/lib/config";

function redact(url: string): string {
  return url.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@");
}

async function main() {
  console.log(`[migrate] target: ${redact(config.databaseUrl)}`);
  const { applied, total } = await runMigrations((m) => console.log(`[migrate] ${m}`));
  console.log(`[migrate] done. applied ${applied.length} new, ${total} total.`);
  await closePool();
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err);
  process.exit(1);
});
