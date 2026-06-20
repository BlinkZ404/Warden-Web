import { describe, it, expect } from "vitest";
import { policyGate, pathMatchesGlob, DEFAULT_DENY_GLOBS } from "@/lib/policy/gate";
import { scopePolicy } from "@/lib/runtime-config";
import { WRITABLE_KEYS } from "@/lib/repo/settings";

describe("blast-radius policy gate", () => {
 const base = { maxFiles: 5, maxChurn: 120, denyGlobs: [] as string[] };

 it("passes a small, tightly-scoped fix", () => {
 expect(policyGate({ files: ["src/checkout.js"], filesChanged: 1, churn: 8 }, base).pass).toBe(
 true);
 });

 it("escalates when too many files change", () => {
 const r = policyGate(
 { files: ["a", "b", "c", "d", "e", "f"], filesChanged: 6, churn: 10 },
 base);
 expect(r.pass).toBe(false);
 expect(r.reasons.join(" ")).toMatch(/too many files/);
 });

 it("escalates an oversized diff", () => {
 const r = policyGate({ files: ["a"], filesChanged: 1, churn: 200 }, base);
 expect(r.pass).toBe(false);
 expect(r.reasons.join(" ")).toMatch(/too large/);
 });

 it("escalates a fix that reaches a protected path", () => {
 const r = policyGate(
 { files: ["src/billing/charge.js"], filesChanged: 1, churn: 5 },
 { ...base, denyGlobs: ["**/billing/**"] });
 expect(r.pass).toBe(false);
 expect(r.reasons.join(" ")).toMatch(/protected path/);
 });
});

describe("glob matcher", () => {
 it("matches ** across segments and * within one", () => {
 expect(pathMatchesGlob("src/auth/login.js", "**/auth/**")).toBe(true);
 expect(pathMatchesGlob("auth/x.js", "**/auth/**")).toBe(true);
 expect(pathMatchesGlob("src/billing/x.js", "**/billing/**")).toBe(true);
 expect(pathMatchesGlob("migrations/0001.sql", "migrations/*")).toBe(true);
 expect(pathMatchesGlob("src/checkout.js", "**/auth/**")).toBe(false);
 // a file literally named billing.js is not inside a billing/ directory
 expect(pathMatchesGlob("src/billing.js", "**/billing/**")).toBe(false);
 });

 it("escapes ? as a literal, not a regex quantifier", () => {
 expect(pathMatchesGlob("config.ts", "config?.ts")).toBe(false);
 expect(pathMatchesGlob("config?.ts", "config?.ts")).toBe(true);
 expect(pathMatchesGlob("src/config.ts", "**/config?.ts")).toBe(false);
 });
});

describe("settings writable-key allowlist", () => {
 it("never lets platform/env-only secrets be dashboard-writable", () => {
 for (const k of [
 "OAUTH_STATE_SECRET",
 "VERCEL_OAUTH_CLIENT_SECRET",
 "GITHUB_OAUTH_CLIENT_SECRET",
 "AGENT_API_KEY",
 "DATABASE_URL",
 ]) {
 expect(WRITABLE_KEYS.has(k)).toBe(false);
 }
 // but the dashboard's own settings are writable
 expect(WRITABLE_KEYS.has("WARDEN_MODE")).toBe(true);
 expect(WRITABLE_KEYS.has("ANTHROPIC_API_KEY")).toBe(true);
 expect(WRITABLE_KEYS.has("FIXER_MODEL")).toBe(true);
 });
});

describe("default protected-path floor", () => {
 const baseline = { maxFiles: 5, maxChurn: 120, denyGlobs: DEFAULT_DENY_GLOBS };
 const blocked = [
  "supabase/migrations/0001_init.sql",
  "db/schema.prisma",
  "prisma/schema.prisma",
  "src/db/schema.ts",
  "src/auth/session.js",
  "lib/auth.ts",
  "scripts/seed.ts",
  "src/seeds/users.ts",
  ".env",
  "apps/web/.env.local",
  "config/secrets/keys.json",
  "queries/report.sql",
 ];

 it("blocks data, schema, auth, seed, secret and env files out of the box", () => {
  for (const f of blocked) {
   const r = policyGate({ files: [f], filesChanged: 1, churn: 5 }, baseline);
   expect(r.pass, f).toBe(false);
   expect(r.reasons.join(" ")).toMatch(/protected path/);
  }
 });

 it("still lets an ordinary source fix through", () => {
  for (const f of ["src/checkout.js", "src/discount.js", "server.js", "app/page.tsx"]) {
   expect(policyGate({ files: [f], filesChanged: 1, churn: 5 }, baseline).pass, f).toBe(true);
  }
 });

 it("is active by default in scopePolicy() with no operator config", () => {
  delete process.env.POLICY_DENY_GLOBS;
  const p = scopePolicy();
  for (const g of DEFAULT_DENY_GLOBS) expect(p.denyGlobs).toContain(g);
 });

 it("merges operator globs on top of the floor, never replacing it", () => {
  process.env.POLICY_DENY_GLOBS = "**/payments/**";
  const p = scopePolicy();
  expect(p.denyGlobs).toContain("**/payments/**");
  for (const g of DEFAULT_DENY_GLOBS) expect(p.denyGlobs).toContain(g);
  delete process.env.POLICY_DENY_GLOBS;
 });
});

describe("glob matcher treats . as a literal, not a wildcard", () => {
 it("matches the dot only against a real dot", () => {
  expect(pathMatchesGlob("db/schema.ts", "**/schema.*")).toBe(true);
  expect(pathMatchesGlob("src/schemaXts.ts", "**/schema.*")).toBe(false);
  expect(pathMatchesGlob(".env", "**/.env*")).toBe(true);
  expect(pathMatchesGlob("aenv", "**/.env*")).toBe(false);
 });
});
