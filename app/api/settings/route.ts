import { allSettings, setSettings, SECRET_KEYS, WRITABLE_KEYS } from "@/lib/repo/settings";
import { hydrateSettings, setting } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns settings; secret values are masked (presence + last 4 only). */
export async function GET() {
 await hydrateSettings();
 const stored = await allSettings();
 const out: Record<string, unknown> = {};
 for (const [k, v] of Object.entries(stored)) {
 if (SECRET_KEYS.has(k)) out[k] = { set: v.length > 0, hint: v.slice(-4) };
 else out[k] = v;
 }
 // Surface effective non-secret runtime config (env fallback) so the dashboard
 // reflects the real mode even when it's set via the environment, not the DB.
 // Without this the UI defaults to "simulation" and a save would flip a
 // live (env-configured) deploy back to simulation.
 for (const k of ["WARDEN_MODE", "BILLING_MODE"]) {
 if (out[k] === undefined) {
 const v = setting(k);
 if (v) out[k] = v;
 }
 }
 return Response.json({ settings: out });
}

/**
 * Upserts the provided keys. A blank value for a secret is ignored so the UI's
 * masked placeholder never overwrites a real key with an empty string.
 */
export async function PUT(req: Request) {
 let body: Record<string, unknown>;
 try {
 body = await req.json();
 } catch {
 return Response.json({ error: "invalid body" }, { status: 400 });
 }
 const entries: Record<string, string> = {};
 for (const [k, v] of Object.entries(body)) {
 if (typeof v !== "string") continue;
 // Only dashboard-settable keys; never platform/env-only secrets (which would
 // shadow process.env via the DB-first overlay).
 if (!WRITABLE_KEYS.has(k)) continue;
 if (SECRET_KEYS.has(k) && v.trim() === "") continue;
 entries[k] = v;
 }
 if (Object.keys(entries).length) await setSettings(entries);
 return Response.json({ ok: true, saved: Object.keys(entries) });
}
