"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Brand, actorLabel } from "@/app/_components/brand";
import { humanizeType, eventSummary } from "@/lib/audit";
import { relativeTime } from "@/lib/ui";

export interface AuditEvent {
 id: string;
 type: string;
 actor: string;
 payload: Record<string, unknown>;
 created_at: string | Date;
 incident_id?: string;
 incident_title?: string;
}

/**
 * The shared audit table for the incident detail + the global log: named columns,
 * top-aligned rows, a time-sort toggle, and per-row expand for long details.
 */
export function AuditTable({
 events,
 showIncident = false,
 emptyText = "no events yet",
}: {
 events: AuditEvent[];
 showIncident?: boolean;
 emptyText?: string;
}) {
 const [desc, setDesc] = useState(true);
 const [open, setOpen] = useState<Set<string>>(new Set());

 function toggle(id: string) {
 setOpen((s) => {
 const n = new Set(s);
 if (n.has(id)) n.delete(id);
 else n.add(id);
 return n;
 });
 }

 // bigserial id is a stable monotonic order even when timestamps tie (sim fires
 // many events in the same second). Memoized so a 5s poll re-render doesn't
 // re-clone + re-sort 200 rows when nothing changed.
 const rows = useMemo(
 () => [...events].sort((a, b) => (Number(b.id) - Number(a.id)) * (desc ? 1 : -1)),
 [events, desc]);

 return (
 <div className="font-mono text-[11px] leading-relaxed">
 <div className="flex items-center gap-4 border-b border-[var(--color-line)] px-5 py-2 text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
 <button
 onClick={() => setDesc((d) => !d)}
 aria-label={`Sort by time, ${desc ? "newest" : "oldest"} first`}
 className="inline-flex w-16 shrink-0 items-center gap-1 uppercase transition hover:text-[var(--color-text)]"
 >
 time <span aria-hidden>{desc ? "↓" : "↑"}</span>
 </button>
 <span className="w-28 shrink-0">event</span>
 <span className="w-24 shrink-0">actor</span>
 {showIncident && <span className="w-40 shrink-0">incident</span>}
 <span className="flex-1">detail</span>
 <span className="w-5 shrink-0" />
 </div>

 {rows.length === 0 && (
 <div className="px-5 py-10 text-center text-[var(--color-muted)]">{emptyText}</div>
 )}

 {rows.map((e) => {
 const isOpen = open.has(e.id);
 // Format at a bounded cap; only pay for the full string when expanded.
 const text = eventSummary(e.type, e.payload, isOpen ? 4000 : 220);
 const expandable = text.length > 90 || text.endsWith("…");
 return (
 <div
 key={e.id}
 className="flex items-start gap-4 border-t border-[var(--color-line)] px-5 py-2 first:border-t-0"
 >
 <span className="w-16 shrink-0 pt-px text-[var(--color-muted)]">
 {relativeTime(e.created_at)}
 </span>
 <span className="w-28 shrink-0 pt-px text-[var(--color-brand-2)]">
 {humanizeType(e.type)}
 </span>
 <span className="flex w-24 shrink-0 items-center gap-1.5 text-[var(--color-text)]">
 <Brand actor={e.actor} size={14} />
 {actorLabel(e.actor)}
 </span>
 {showIncident && (
 <Link
 href={`/dashboard/${e.incident_id}`}
 className="w-40 shrink-0 truncate pt-px text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
 title={e.incident_title}
 >
 {e.incident_title}
 </Link>
 )}
 <span
 className={`min-w-0 flex-1 pt-px text-[var(--color-muted)] ${
 isOpen ? "whitespace-pre-wrap break-words" : "truncate"
 }`}
 >
 {text}
 </span>
 <button
 onClick={() => expandable && toggle(e.id)}
 aria-label={isOpen ? "collapse" : "expand"}
 className={`w-5 shrink-0 text-center text-[var(--color-muted)] transition ${
 expandable ? "hover:text-[var(--color-text)]" : "pointer-events-none opacity-0"
 }`}
 >
 {isOpen ? "▾" : "▸"}
 </button>
 </div>
 );
 })}
 </div>
 );
}
