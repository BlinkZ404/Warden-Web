"use client";

import { usePolled } from "@/app/_components/use-polled";
import { Dot } from "@/app/_components/console";

type Inc = { status: string };

// Incidents in these states are closed out; everything else is still in flight
// and worth surfacing to whoever is on call.
const TERMINAL = new Set(["resolved", "dismissed", "failed"]);

/** A global on-call status: how many incidents are currently in flight, with a
 * live dot. Polls the incident list so it reads the same on every page. */
export function LiveStatus() {
 const { data } = usePolled<Inc[]>(
 "/api/incidents",
 (j) => (j as { incidents: Inc[] }).incidents ?? [],
 5000);
 const active = (data ?? []).filter((i) => !TERMINAL.has(i.status)).length;
 const tone = active > 0 ? "var(--color-warn)" : "var(--color-ok)";
 return (
 <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
 <Dot tone={tone} />
 {active > 0 ? `${active} active` : "all clear"}
 <span className="opacity-40">·</span> live
 </span>
 );
}
