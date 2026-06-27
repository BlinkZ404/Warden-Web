"use client";

import { useMemo, useState } from "react";
import type { AuditRow } from "@/lib/view";
import { Frame, Label, Chip, PageHeader, PageBody, ErrorState, Banner } from "@/app/_components/console";
import { AuditTable } from "@/app/_components/audit-table";
import { usePolled } from "@/app/_components/use-polled";
import { humanizeType } from "@/lib/audit";

export default function AuditPage() {
 const { data, error, loaded, reload } = usePolled<AuditRow[]>(
 "/api/audit?limit=200",
 (j) => (j as { events: AuditRow[] }).events ?? [],
 5000);
 const events = useMemo(() => data ?? [], [data]);
 const [filter, setFilter] = useState<string>("all");

 const types = useMemo(() => {
 const counts = new Map<string, number>();
 for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
 return [...counts.entries()].sort((a, b) => b[1] - a[1]);
 }, [events]);

 const shown = filter === "all" ? events : events.filter((e) => e.type === filter);
 // Keep the active filter's chip visible even when its events have aged out of
 // the current window, so the selection is never silently unclearable.
 const chips =
 filter !== "all" && !types.some(([t]) => t === filter) ? [...types, [filter, 0] as const] : types;

 return (
 <div>
 <PageHeader
 title="audit log"
 aside={
 <span className="font-mono text-[11px] text-[var(--color-muted)]">
 {events.length} events <span className="opacity-40">·</span> live
 </span>
 }
 />

 <PageBody>
 {error && events.length > 0 && (
 <Banner tone="var(--color-warn)">Couldn&rsquo;t refresh. Showing the last update.</Banner>
 )}
 <div className="mb-3 flex flex-wrap items-center gap-2">
 <Label>filter</Label>
 <Chip uppercase active={filter === "all"} onClick={() => setFilter("all")}>
 all <span className="opacity-50">{events.length}</span>
 </Chip>
 {chips.map(([t, n]) => (
 <Chip key={t} uppercase active={filter === t} onClick={() => setFilter(t)}>
 {humanizeType(t).toLowerCase()} <span className="opacity-50">{n}</span>
 </Chip>
 ))}
 </div>

 <Frame innerClassName="py-3">
 {error && events.length === 0 ? (
 <ErrorState onRetry={reload} />
 ) : (
 <AuditTable
 events={shown}
 showIncident
 emptyText={
 !loaded
 ? "loading…"
 : filter !== "all"
 ? `no ${humanizeType(filter).toLowerCase()} events in view`
 : "No events yet. Trigger an incident from the dashboard."
 }
 />
 )}
 </Frame>
 </PageBody>
 </div>
 );
}
