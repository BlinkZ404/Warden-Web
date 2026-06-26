/**
 * Secure one table: generate the policy DDL, apply it (recorded here; a real
 * deployment runs it through a scope-limited migration credential), then assert
 * the anon role can no longer read the table. The fix is only recorded if the
 * assertion holds, mirroring the verify-not-review contract of the main pipeline.
 */
import { hydrateSettings, isLiveRuntime } from "@/lib/runtime-config";
import { SIM_TABLES, assessPosture, assertSecured, policySqlFor } from "@/lib/security/rls";
import { secureTable, securedSet } from "@/lib/repo/posture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await hydrateSettings();
  // Simulation-only lane (see GET /api/security): never act on the canned schema
  // in live mode.
  if (isLiveRuntime()) {
    return Response.json({ error: "the posture scan is simulation-only" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { table?: unknown; decidedBy?: unknown };
  const table = typeof body.table === "string" ? body.table : "";
  const decidedBy = typeof body.decidedBy === "string" && body.decidedBy ? body.decidedBy : "founder";

  const set = await securedSet();
  const target = assessPosture(SIM_TABLES, set).find((p) => p.name === table);
  if (!target) {
    return Response.json({ error: "unknown table" }, { status: 400 });
  }
  if (target.status !== "open") {
    return Response.json({ error: `table is not an open finding (${target.status})` }, { status: 409 });
  }

  // Apply, then verify by reading the PERSISTED state back (not the write's own
  // return value), so a write that did not land reports verified:false rather than
  // a vacuous true.
  await secureTable(table, decidedBy, new Date().toISOString());
  const verified = assertSecured(table, await securedSet());

  return Response.json({ ok: true, table, verified, policySql: policySqlFor(table) });
}
