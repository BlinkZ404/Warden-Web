"use client";

import { useEffect, useState } from "react";
import type { AuditRow } from "@/lib/view";
import { Frame, PageHeader, PageBody, ErrorState, Banner, Button, Pager } from "@/app/_components/console";
import { Select, FIELD } from "@/app/_components/form";
import { AuditTable } from "@/app/_components/audit-table";
import { usePolled } from "@/app/_components/use-polled";
import { actorLabel } from "@/app/_components/brand";
import { humanizeType } from "@/lib/audit";

type AuditResponse = { events: AuditRow[]; total: number; types: string[]; actors: string[] };

const PAGE_SIZE = 20;

export default function AuditPage() {
 const [qInput, setQInput] = useState("");
 const [q, setQ] = useState("");
 const [type, setType] = useState("");
 const [actor, setActor] = useState("");
 const [page, setPage] = useState(0);

 // Debounce the search box so a keystroke doesn't fire one request per character;
 // a new query also returns to the first page.
 useEffect(() => {
 const t = setTimeout(() => {
 setQ(qInput);
 setPage(0);
 }, 300);
 return () => clearTimeout(t);
 }, [qInput]);

 const params = new URLSearchParams({
 limit: String(PAGE_SIZE),
 offset: String(page * PAGE_SIZE),
 });
 if (type) params.set("type", type);
 if (actor) params.set("actor", actor);
 if (q) params.set("q", q);

 const { data, error, loaded, reload } = usePolled<AuditResponse>(
 `/api/audit?${params.toString()}`,
 (j) => j as AuditResponse,
 5000);

 const events = data?.events ?? [];
 const total = data?.total ?? 0;
 const types = data?.types ?? [];
 const actors = data?.actors ?? [];
 const filtered = Boolean(q || type || actor);

 // Clamp to the last page when the feed shrinks (e.g. a reset), so the pager
 // never strands the view on an out-of-range, empty page.
 useEffect(() => {
 const last = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
 if (page > last) setPage(last);
 }, [total, page]);

 function clearAll() {
 setQInput("");
 setQ("");
 setType("");
 setActor("");
 setPage(0);
 }

 return (
 <div>
 <PageHeader title="audit log" />

 <PageBody>
 {error && events.length > 0 && (
 <Banner tone="var(--color-warn)">Couldn&rsquo;t refresh. Showing the last update.</Banner>
 )}

 <div className="mb-3 flex flex-wrap items-center gap-2">
 <div className="min-w-[200px] flex-1">
 <input
 type="text"
 aria-label="Search events, actors, and details"
 spellCheck={false}
 placeholder="Search events, actors, details…"
 value={qInput}
 onChange={(e) => setQInput(e.target.value)}
 className={FIELD}
 />
 </div>
 <Select
 value={type}
 onChange={(v) => {
 setType(v);
 setPage(0);
 }}
 className="min-w-[150px]"
 aria-label="Filter by event type"
 >
 <option value="">All events</option>
 {types.map((t) => (
 <option key={t} value={t}>
 {humanizeType(t)}
 </option>
 ))}
 </Select>
 <Select
 value={actor}
 onChange={(v) => {
 setActor(v);
 setPage(0);
 }}
 className="min-w-[150px]"
 aria-label="Filter by actor"
 >
 <option value="">All actors</option>
 {actors.map((a) => (
 <option key={a} value={a}>
 {actorLabel(a)}
 </option>
 ))}
 </Select>
 {filtered && (
 <Button variant="ghost" size="sm" onClick={clearAll}>
 Clear
 </Button>
 )}
 </div>

 <Frame innerClassName="py-3">
 {error && events.length === 0 ? (
 <ErrorState onRetry={reload} />
 ) : (
 <AuditTable
 events={events}
 showIncident
 emptyText={
 !loaded
 ? "loading…"
 : filtered
 ? "no events match these filters"
 : "No events yet. Trigger an incident from the dashboard."
 }
 />
 )}
 </Frame>

 <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} className="mt-3" />
 </PageBody>
 </div>
 );
}
