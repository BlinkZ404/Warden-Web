import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // The pipeline does real git + Postgres work; give it room. Tests share a
    // single database, so run every file strictly sequentially in ONE process —
    // otherwise one file's resetDatabase() TRUNCATE can fire mid-pipeline in
    // another and pull rows out from under it.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    sequence: { concurrent: false },
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
  },
});
