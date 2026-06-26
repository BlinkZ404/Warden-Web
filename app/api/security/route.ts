/**
 * Posture scan results. GET assesses every table against the secured set and
 * returns the full posture (open findings + already-protected tables).
 */
import { hydrateSettings, isLiveRuntime } from "@/lib/runtime-config";
import { SIM_TABLES, assessPosture } from "@/lib/security/rls";
import { securedSet } from "@/lib/repo/posture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await hydrateSettings();
  // The RLS posture scan is a simulation-only lane: SIM_TABLES is a canned
  // Supabase schema, and the live scanner (reading information_schema) is not
  // built. In live mode return nothing rather than present fake exposures as real.
  if (isLiveRuntime()) {
    return Response.json({ postures: [], live: true });
  }
  const postures = assessPosture(SIM_TABLES, await securedSet());
  return Response.json({ postures });
}
