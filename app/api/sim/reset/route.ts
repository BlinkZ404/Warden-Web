/**
 * Clear simulated incidents so a demo can start fresh, leaving config (keys,
 * wallet, settings, push subscriptions) intact. Powers the dashboard's "Clear
 * incidents" action. Sim-only: never wipes incidents when running live.
 */
import { clearIncidents } from "@/lib/db/migrate";
import { hydrateSettings, isLiveRuntime } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await hydrateSettings();
  if (isLiveRuntime()) {
    return Response.json({ error: "clearing incidents is disabled in live mode" }, { status: 403 });
  }
  await clearIncidents();
  return Response.json({ ok: true });
}
