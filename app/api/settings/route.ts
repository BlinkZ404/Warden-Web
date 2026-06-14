import { allSettings, setSettings, SECRET_KEYS, WRITABLE_KEYS } from "@/lib/repo/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns settings; secret values are masked (presence + last 4 only). */
export async function GET() {
 const stored = await allSettings();
 const out: Record<string, unknown> = {};
 for (const [k, v] of Object.entries(stored)) {
 if (SECRET_KEYS.has(k)) out[k] = { set: v.length > 0, hint: v.slice(-4) };
 else out[k] = v;
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
