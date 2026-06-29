"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { IncidentRow } from "@/lib/view";
import type { IncidentStatus } from "@/lib/db/types";
import { StatusBadge } from "@/app/_components/ui";
import { Select, FIELD } from "@/app/_components/form";
import { Pager } from "@/app/_components/console";
import { relativeTime, statusMeta } from "@/lib/ui";

type SortKey = "incident" | "status" | "review" | "tests" | "memory" | "updated";
type Dir = "asc" | "desc";

interface Column {
 key: SortKey;
 label: string;
 className?: string;
 /** Default direction when this column is first selected. */
 initial: Dir;
}

const COLUMNS: Column[] = [
 { key: "incident", label: "Incident", className: "flex-1", initial: "asc" },
 { key: "status", label: "Status", className: "w-44 shrink-0", initial: "asc" },
 { key: "review", label: "Review", className: "w-20 shrink-0", initial: "desc" },
 { key: "tests", label: "Tests", className: "w-20 shrink-0", initial: "desc" },
 { key: "memory", label: "Memory", className: "w-24 shrink-0", initial: "desc" },
 { key: "updated", label: "Updated", className: "w-24 shrink-0", initial: "desc" },
];

const PAGE_SIZE = 20;

/** Comparable numeric/string key per sortable column. */
function sortValue(i: IncidentRow, key: SortKey): number | string {
 switch (key) {
 case "incident":
 return i.title.toLowerCase();
 case "status":
 return statusMeta(i.status).label.toLowerCase();
 case "review":
 return i.reviews_total === 0 ? -1 : i.reviews_approved / i.reviews_total;
 case "tests":
 return i.test_passed === null ? -1 : i.test_passed ? 1 : 0;
 case "memory":
 return i.seen_before ? 1 : 0;
 case "updated":
 return new Date(i.updated_at).getTime();
 }
}

/**
 * The incidents list: free-text search, a status filter, sortable columns, a
 * per-row expander, and paging. Built on the same sort/expand interaction model
 * as the audit table so the two read alike.
 */
export function IncidentsTable({ incidents }: { incidents: IncidentRow[] }) {
 const [q, setQ] = useState("");
 const [status, setStatus] = useState("");
 const [sort, setSort] = useState<SortKey>("updated");
 const [dir, setDir] = useState<Dir>("desc");
 const [page, setPage] = useState(0);
 const [open, setOpen] = useState<Set<string>>(new Set());

 // Any change to the filters or sort returns to the first page.
 useEffect(() => setPage(0), [q, status, sort, dir]);

 // Always include the active filter, so a status that ages out of the live list
 // still shows on the control (and stays clearable) instead of blanking it.
 const statuses = useMemo(() => {
 const set = new Set(incidents.map((i) => i.status));
 if (status) set.add(status as IncidentStatus);
 return [...set].sort();
 }, [incidents, status]);

 function toggle(id: string) {
 setOpen((s) => {
 const n = new Set(s);
 if (n.has(id)) n.delete(id);
 else n.add(id);
 return n;
 });
 }

 function sortBy(key: SortKey) {
 if (key === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
 else {
 setSort(key);
 setDir(COLUMNS.find((c) => c.key === key)!.initial);
 }
 }

 const rows = useMemo(() => {
 const needle = q.trim().toLowerCase();
 const filtered = incidents.filter((i) => {
 if (status && i.status !== status) return false;
 if (!needle) return true;
 return [i.title, i.service ?? "", statusMeta(i.status).label]
 .join(" ")
 .toLowerCase()
 .includes(needle);
 });
 const mul = dir === "asc" ? 1 : -1;
 return [...filtered].sort((a, b) => {
 const av = sortValue(a, sort);
 const bv = sortValue(b, sort);
 if (av < bv) return -1 * mul;
 if (av > bv) return 1 * mul;
 return 0;
 });
 }, [incidents, q, status, sort, dir]);

 const total = rows.length;

 // Clamp to the last page when the live list shrinks, so the pager never strands
 // the view on an out-of-range, empty page.
 useEffect(() => {
 const last = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
 if (page > last) setPage(last);
 }, [total, page]);

 const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
 const filtering = Boolean(q || status);

 return (
 <div className="font-mono text-[11px]">
 <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] px-4 py-2.5">
 <div className="min-w-[180px] flex-1">
 <input
 value={q}
 onChange={(e) => setQ(e.target.value)}
 placeholder="search incidents…"
 aria-label="Search incidents by title, service, or status"
 className={FIELD}
 />
 </div>
 <Select value={status} onChange={setStatus} className="min-w-[150px]" aria-label="Filter by status">
 <option value="">All statuses</option>
 {statuses.map((s) => (
 <option key={s} value={s}>
 {statusMeta(s).label}
 </option>
 ))}
 </Select>
 {filtering && (
 <span className="shrink-0 text-[10px] text-[var(--color-muted)]">
 {total} of {incidents.length}
 </span>
 )}
 </div>

 <div className="overflow-x-auto">
 <div className="min-w-[820px]">
 <div className="flex items-center gap-4 border-b border-[var(--color-line)] px-4 py-2 text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
 <span className="w-4 shrink-0" />
 {COLUMNS.map((c) => (
 <button
 key={c.key}
 onClick={() => sortBy(c.key)}
 className={`inline-flex cursor-pointer items-center gap-1 text-left uppercase transition hover:text-[var(--color-text)] ${c.className ?? ""}`}
 >
 {c.label}
 <span aria-hidden className={sort === c.key ? "" : "opacity-0"}>
 {dir === "asc" ? "↑" : "↓"}
 </span>
 </button>
 ))}
 </div>

 {pageRows.length === 0 && (
 <div className="px-4 py-10 text-center text-[var(--color-muted)]">
 {incidents.length === 0 ? "No incidents yet. Trigger one above." : "No matches"}
 </div>
 )}

 {pageRows.map((i) => {
 const isOpen = open.has(i.id);
 return (
 <div key={i.id} className="border-t border-[var(--color-line)] first:border-t-0">
 <div className="flex items-center gap-4 px-4 py-3 transition hover:bg-[var(--color-panel-2)]">
 <button
 onClick={() => toggle(i.id)}
 aria-label={isOpen ? "collapse" : "expand"}
 className="w-4 shrink-0 text-center text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
 >
 {isOpen ? "▾" : "▸"}
 </button>
 <Link href={`/dashboard/${i.id}`} className="min-w-0 flex-1">
 <div className="truncate font-sans text-sm font-medium text-[var(--color-text)]">
 {i.title}
 </div>
 <div className="truncate text-[11px] text-[var(--color-muted)]">{i.service}</div>
 </Link>
 <div className="w-44 shrink-0">
 <StatusBadge status={i.status} />
 </div>
 <div className="w-20 shrink-0 whitespace-nowrap">
 {i.reviews_total === 0 ? (
 <span className="text-[var(--color-muted)]">—</span>
 ) : (
 <span
 title="reviewers that approved / panel size"
 style={{
 color:
 i.reviews_approved === i.reviews_total
 ? "var(--color-ok)"
 : "var(--color-warn)",
 }}
 >
 {i.reviews_approved}/{i.reviews_total} ✓
 </span>
 )}
 </div>
 <div className="w-20 shrink-0 whitespace-nowrap">
 {i.test_passed === null ? (
 <span className="text-[var(--color-muted)]">—</span>
 ) : i.test_passed ? (
 <span className="text-[var(--color-ok)]">✓ pass</span>
 ) : (
 <span className="text-[var(--color-bad)]">✗ fail</span>
 )}
 </div>
 <div className="w-24 shrink-0 whitespace-nowrap">
 {i.seen_before ? (
 <span className="text-[var(--color-escalate)]" title="Recognized via pgvector">
 seen before
 </span>
 ) : (
 <span className="text-[var(--color-muted)]">new</span>
 )}
 </div>
 <div className="w-24 shrink-0 whitespace-nowrap text-[var(--color-muted)]">
 {relativeTime(i.updated_at)}
 </div>
 </div>

 {isOpen && (
 <div className="border-t border-[var(--color-line)] bg-[var(--color-panel-2)] px-4 py-3 pl-12">
 <p className="font-sans text-sm leading-relaxed text-[var(--color-text)]">
 {i.title}
 </p>
 <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-[var(--color-muted)]">
 <span>
 service <span className="text-[var(--color-text)]">{i.service ?? "—"}</span>
 </span>
 {i.severity && (
 <span>
 severity <span className="text-[var(--color-text)]">{i.severity}</span>
 </span>
 )}
 <span>
 detected{" "}
 <span className="text-[var(--color-text)]">{relativeTime(i.created_at)}</span>
 </span>
 <Link
 href={`/dashboard/${i.id}`}
 className="text-[var(--color-brand-2)] transition hover:underline"
 >
 open incident ↗
 </Link>
 </div>
 </div>
 )}
 </div>
 );
 })}
 </div>
 </div>

 <Pager
 page={page}
 pageSize={PAGE_SIZE}
 total={total}
 onPage={setPage}
 className="border-t border-[var(--color-line)] px-4 py-2.5"
 />
 </div>
 );
}
