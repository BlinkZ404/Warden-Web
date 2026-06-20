import { describe, it, expect, beforeEach } from "vitest";
import { resetDatabase } from "./util";
import {
  SIM_TABLES,
  assessPosture,
  openFindings,
  policySqlFor,
  assertSecured,
} from "@/lib/security/rls";
import { secureTable, getSecured, securedSet } from "@/lib/repo/posture";

describe("rls posture scan", () => {
  it("flags RLS-off tables as open, leaves protected and by-design-public alone", () => {
    const byName = Object.fromEntries(
      assessPosture(SIM_TABLES, new Set()).map((p) => [p.name, p.status]),
    );
    expect(byName.users).toBe("open");
    expect(byName.orders).toBe("open");
    expect(byName.messages).toBe("open");
    expect(byName.subscriptions).toBe("protected"); // RLS already on
    expect(byName.public_pages).toBe("intentional"); // public by design
  });

  it("orders open findings by severity, critical first", () => {
    const open = openFindings(assessPosture(SIM_TABLES, new Set()));
    expect(open[0].severity).toBe("critical");
    expect(open.at(-1)!.severity).toBe("high");
    expect(open.map((p) => p.name)).not.toContain("public_pages");
  });

  it("generates a policy that enables RLS and adds an owner read policy", () => {
    const sql = policySqlFor("users");
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/CREATE POLICY/);
    expect(sql).toContain('"users"');
  });

  it("a secured table is no longer an open finding and passes the assertion", () => {
    const secured = new Set(["users"]);
    const byName = Object.fromEntries(
      assessPosture(SIM_TABLES, secured).map((p) => [p.name, p.status]),
    );
    expect(byName.users).toBe("secured");
    expect(openFindings(assessPosture(SIM_TABLES, secured)).map((p) => p.name)).not.toContain(
      "users",
    );
    expect(assertSecured("users", secured)).toBe(true);
    expect(assertSecured("orders", secured)).toBe(false);
  });
});

describe("posture persistence", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("records a secured table and reads it back; re-securing is idempotent", async () => {
    expect(await getSecured()).toEqual([]);

    await secureTable("users", "founder", "2026-06-16T00:00:00Z");
    const set = await securedSet();
    expect(set.has("users")).toBe(true);

    const records = await getSecured();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ table: "users", securedBy: "founder" });

    await secureTable("users", "founder", "2026-06-16T01:00:00Z");
    expect(await getSecured()).toHaveLength(1); // no duplicate
  });
});
