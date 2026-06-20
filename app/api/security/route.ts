/**
 * Posture scan results. GET assesses every table against the secured set and
 * returns the full posture (open findings + already-protected tables).
 */
import { hydrateSettings } from "@/lib/runtime-config";
import { SIM_TABLES, assessPosture } from "@/lib/security/rls";
import { securedSet } from "@/lib/repo/posture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await hydrateSettings();
  const postures = assessPosture(SIM_TABLES, await securedSet());
  return Response.json({ postures });
}
