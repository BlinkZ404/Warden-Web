"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface Polled<T> {
 data: T | null;
 /** True only after a failed fetch; last-good data is kept so the view doesn't blank. */
 error: boolean;
 /** True after the first fetch settles, so callers can gate empty vs loading. */
 loaded: boolean;
 reload: () => void;
}

/**
 * Fetch a JSON endpoint once and on an interval. Keeps the last-good value when a
 * poll fails AND raises `error`, so a transient failure never silently presents
 * stale data as truth. One hook for every data view (PLAN: shared UI state).
 */
export function usePolled<T>(url: string, pick: (json: unknown) => T, intervalMs = 3000): Polled<T> {
 const [data, setData] = useState<T | null>(null);
 const [error, setError] = useState(false);
 const [loaded, setLoaded] = useState(false);
 const pickRef = useRef(pick);
 pickRef.current = pick;

 const load = useCallback(async () => {
 try {
 const r = await fetch(url, { cache: "no-store" });
 if (!r.ok) {
 setError(true);
 return;
 }
 setData(pickRef.current(await r.json()));
 setError(false);
 } catch {
 setError(true);
 } finally {
 setLoaded(true);
 }
 }, [url]);

 useEffect(() => {
 load();
 if (!intervalMs) return;
 const t = setInterval(load, intervalMs);
 return () => clearInterval(t);
 }, [load, intervalMs]);

 return { data, error, loaded, reload: load };
}
