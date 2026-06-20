/**
 * Persistence for the posture-scan lane: which tables the founder has secured,
 * and when. Kept in the `settings` table under one JSON key so the lane needs no
 * schema migration; the record doubles as the lane's audit (who secured what,
 * when). `resetDatabase()` truncates `settings`, so tests start clean.
 */
import { getSetting, setSettings } from "@/lib/repo/settings";

// Written server-side only; intentionally NOT in WRITABLE_KEYS, so the dashboard
// settings API can't touch it (same pattern as the OAuth token writes).
const KEY = "POSTURE_SECURED";

export interface SecuredRecord {
  table: string;
  securedAt: string;
  securedBy: string;
}

export async function getSecured(): Promise<SecuredRecord[]> {
  const raw = await getSetting(KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as SecuredRecord[]) : [];
  } catch {
    return [];
  }
}

export async function securedSet(): Promise<Set<string>> {
  return new Set((await getSecured()).map((r) => r.table));
}

/** Record a table as secured. Idempotent: re-securing returns the existing set. */
export async function secureTable(
  table: string,
  by: string,
  at: string,
): Promise<SecuredRecord[]> {
  const current = await getSecured();
  if (current.some((r) => r.table === table)) return current;
  const next = [...current, { table, securedAt: at, securedBy: by }];
  await setSettings({ [KEY]: JSON.stringify(next) });
  return next;
}
