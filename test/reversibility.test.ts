import { describe, it, expect } from "vitest";
import { classifyReversibility } from "@/lib/policy/reversibility";

describe("classifyReversibility", () => {
  it("a code-only fix is fully reversible", () => {
    const r = classifyReversibility(["src/checkout.js", "app/page.tsx", "lib/util.ts"]);
    expect(r.reversible).toBe(true);
    expect(r.label).toMatch(/reversible/i);
  });

  it("flags migration, schema, prisma, sql, and seed files as not fully reversible", () => {
    for (const f of [
      "supabase/migrations/0001_init.sql",
      "db/schema.prisma",
      "prisma/schema.prisma",
      "src/db/schema.ts",
      "queries/report.sql",
      "scripts/seed.ts",
      "src/seeds/users.ts",
    ]) {
      expect(classifyReversibility([f]).reversible, f).toBe(false);
    }
  });

  it("an empty change is treated as reversible", () => {
    expect(classifyReversibility([]).reversible).toBe(true);
  });

  it("one irreversible file among code files taints the whole change", () => {
    expect(classifyReversibility(["src/checkout.js", "migrations/0002.sql"]).reversible).toBe(false);
  });
});
