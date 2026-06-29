"use client";

import type { IncidentStatus } from "@/lib/db/types";
import { PIPELINE_STAGES, stageIndex, isOfframp, statusMeta } from "@/lib/ui";

export function StatusBadge({ status }: { status: IncidentStatus }) {
 const m = statusMeta(status);
 return (
 <span
 className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider"
 style={{
 color: m.color,
 borderColor: `color-mix(in srgb, ${m.color} 35%, transparent)`,
 background: `color-mix(in srgb, ${m.color} 12%, transparent)`,
 }}
 >
 <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
 {m.label}
 </span>
 );
}

/** Single-row pipeline stepper that fills its container. */
export function PipelineBar({ status }: { status: IncidentStatus }) {
 const offramp = isOfframp(status);
 const idx = stageIndex(status);
 const resolved = status === "resolved";
 const last = PIPELINE_STAGES.length - 1;

 if (offramp) {
 return (
 <div className="flex items-center gap-3">
 <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
 pipeline halted
 </span>
 <StatusBadge status={status} />
 </div>
 );
 }

 return (
 <div className="overflow-x-auto">
 <div className="flex w-full min-w-[680px]">
 {PIPELINE_STAGES.map((stage, i) => {
 const done = resolved ? true : i < idx;
 const active = i === idx;
 const color = done
 ? "var(--color-ok)"
 : active
 ? "var(--color-accent)"
 : "var(--color-muted)";
 return (
 <div
 key={stage.key}
 className="relative flex flex-1 flex-col items-center px-1"
 title={stage.who ? `${stage.label} · ${stage.who}` : stage.label}
 >
 {i < last && (
 <div
 className="absolute left-1/2 top-[4.5px] h-px w-full"
 style={{ background: done ? "var(--color-ok)" : "var(--color-line)" }}
 />
 )}
 <div
 className={`relative z-10 h-2.5 w-2.5 rounded-full transition ${active ? "wd-step-pulse" : ""}`}
 style={{
 background: done || active ? color : "var(--color-panel)",
 border: `1.5px solid ${color}`,
 boxShadow: active ? undefined : "none",
 }}
 />
 <span
 className="mt-2.5 whitespace-nowrap font-mono text-[9px] uppercase tracking-wider"
 style={{ color, opacity: done || active ? 1 : 0.55 }}
 >
 {stage.label}
 </span>
 </div>
 );
 })}
 </div>
 </div>
 );
}

export function VerdictPill({ verdict }: { verdict: string | null }) {
 if (!verdict) return <span className="text-[var(--color-muted)]">—</span>;
 const color =
 verdict === "approve"
 ? "var(--color-ok)"
 : verdict === "reject"
 ? "var(--color-bad)"
 : "var(--color-warn)";
 return (
 <span className="font-mono text-[11px] font-medium uppercase tracking-wider" style={{ color }}>
 {verdict}
 </span>
 );
}
