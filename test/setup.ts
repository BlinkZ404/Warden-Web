/** Global test setup: ensure the schema exists, close the pool when done. */
import { afterAll } from "vitest";
import { runMigrations } from "@/lib/db/migrate";
import { closePool } from "@/lib/db/client";

await runMigrations();

afterAll(async () => {
  await closePool();
});
