"use client";

import { useCallback, useEffect, useState } from "react";

/** Loads settings from /api/settings and tracks edits + per-section saving. */
export function useSettings() {
 const [loaded, setLoaded] = useState<Record<string, unknown>>({});
 const [draft, setDraft] = useState<Record<string, string>>({});
 const [saving, setSaving] = useState<string | null>(null);
 const [error, setError] = useState<string | null>(null);

 const reload = useCallback(async () => {
 try {
 const r = await fetch("/api/settings", { cache: "no-store" });
 if (r.ok) setLoaded((await r.json()).settings ?? {});
 } catch {
 /* keep current state */
 }
 }, []);

 useEffect(() => {
 reload();
 }, [reload]);

 const text = (key: string, fallback = "") =>
 draft[key] ?? (typeof loaded[key] === "string" ? (loaded[key] as string) : fallback);
 const draftVal = (key: string) => draft[key] ?? "";
 const set = (key: string, v: string) => setDraft((d) => ({ ...d, [key]: v }));
 const secret = (key: string): { set: boolean; hint: string } => {
 const v = loaded[key];
 return v && typeof v === "object"
 ? (v as { set: boolean; hint: string })
 : { set: false, hint: "" };
 };

 async function save(section: string, keys: string[]): Promise<boolean> {
 setSaving(section);
 setError(null);
 const body: Record<string, string> = {};
 for (const k of keys) if (draft[k] !== undefined) body[k] = draft[k];
 try {
 const r = await fetch("/api/settings", {
 method: "PUT",
 headers: { "content-type": "application/json" },
 body: JSON.stringify(body),
 });
 // fetch resolves on 4xx/5xx, so a failed save must not clear the draft;
 // otherwise the user's typed key is discarded with nothing persisted.
 if (!r.ok) {
 setError(`Could not save (${r.status}). Your changes are kept; try again.`);
 return false;
 }
 setDraft((d) => {
 const n = { ...d };
 keys.forEach((k) => delete n[k]);
 return n;
 });
 await reload();
 return true;
 } catch {
 setError("Could not save. Check your connection and try again.");
 return false;
 } finally {
 setSaving(null);
 }
 }

 return { text, draftVal, set, secret, save, saving, error };
}

export type UseSettings = ReturnType<typeof useSettings>;
