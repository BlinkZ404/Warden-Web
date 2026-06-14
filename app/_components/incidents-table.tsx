"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { IncidentRow } from "@/lib/view";
import { StatusBadge } from "@/app/_components/ui";
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
 * The incidents list: free-text search, sortable columns, and a per-row expander
 * that surfaces the signals inline without leaving the page. Built on the same
 * sort/expand interaction model as the audit table so the two read alike.
 */
export function IncidentsTable({ incidents }: { incidents: IncidentRow[] }) {
 const [q, setQ] = useState("");
 const [sort, setSort] = useState<SortKey>("updated");
 const [dir, setDir] = useState<Dir>("desc");
 const [open, setOpen] = useState<Set<string>>(new Set());

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
 const filtered = needle
 ? incidents.filter((i) =>
 [i.title, i.service ?? "", statusMeta(i.status).label]
 .join(" ")
 .toLowerCase()
 .includes(needle))
 : incidents;
 const mul = dir === "asc" ? 1 : -1;
 return [...filtered].sort((a, b) => {
 const av = sortValue(a, sort);
 const bv = sortValue(b, sort);
 if (av < bv) return -1 * mul;
 if (av > bv) return 1 * mul;
 return 0;
 });
 }, [incidents, q, sort, dir]);

 return (
 <div className="font-mono text-[11px]">
 <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] px-4 py-2.5">
 <input
 value={q}
 onChange={(e) => setQ(e.target.value)}
 placeholder="search incidents…"
 className="w-56 max-w-full rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none"
 />
 {q && (
 <span className="text-[10px] text-[var(--color-muted)]">
 {rows.length} of {incidents.length}
 </span>
 )}
 </div>

 <div className="overflow-x-auto">
 <div className="min-w-[680px]">
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

 {rows.length === 0 && (
 <div className="px-4 py-10 text-center text-[var(--color-muted)]">
 {incidents.length === 0 ? "No incidents yet. Trigger one above." : "No matches"}
 </div>
 )}

 {rows.map((i) => {
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
 </div>
 );
}
