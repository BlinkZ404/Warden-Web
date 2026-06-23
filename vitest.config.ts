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
    // single database, so run every file strictly sequentially in ONE worker;
    // otherwise one file's resetDatabase() TRUNCATE can fire mid-pipeline in
    // another and pull rows out from under it. In Vitest 4, `fileParallelism:
    // false` forces a single worker (maxWorkers → 1), replacing the old
    // `poolOptions.forks.singleFork`.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: "forks",
    fileParallelism: false,
    sequence: { concurrent: false },
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
  },
});
