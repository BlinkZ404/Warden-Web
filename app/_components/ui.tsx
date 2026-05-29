"use client";

import type { IncidentStatus } from "@/lib/db/types";
import { PIPELINE_STAGES, stageIndex, isOfframp, statusMeta } from "@/lib/ui";

export function StatusBadge({ status }: { status: IncidentStatus }) {
  const m = statusMeta(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ color: m.color, background: `color-mix(in srgb, ${m.color} 15%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

/** Horizontal pipeline progress (PLAN §6). Highlights done / active / pending. */
export function PipelineBar({ status }: { status: IncidentStatus }) {
  const offramp = isOfframp(status);
  const idx = stageIndex(status);
  const resolved = status === "resolved";

  return (
    <div className="flex flex-wrap items-center gap-1">
      {PIPELINE_STAGES.map((stage, i) => {
        const done = !offramp && (resolved ? true : i < idx);
        const active = !offramp && i === idx;
        const color = done
          ? "var(--color-ok)"
          : active
            ? "var(--color-accent)"
            : "var(--color-muted)";
        return (
          <div key={stage.key} className="flex items-center gap-1">
            <div
              className="flex flex-col items-center"
              title={stage.who ? `${stage.label} · ${stage.who}` : stage.label}
            >
              <div
                className="h-2 w-2 rounded-full transition"
                style={{
                  background: done || active ? color : "transparent",
                  border: `1.5px solid ${color}`,
                  boxShadow: active ? `0 0 0 3px color-mix(in srgb, ${color} 25%, transparent)` : "none",
                }}
              />
              <span
                className="mt-1 text-[10px] leading-none"
                style={{ color, opacity: done || active ? 1 : 0.6 }}
              >
                {stage.label}
              </span>
            </div>
            {i < PIPELINE_STAGES.length - 1 && (
              <div
                className="mb-3.5 h-px w-4"
                style={{ background: done ? "var(--color-ok)" : "var(--color-line)" }}
              />
            )}
          </div>
        );
      })}
      {offramp && (
        <div className="ml-2 mb-3.5">
          <StatusBadge status={status} />
        </div>
      )}
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
    <span className="text-xs font-medium" style={{ color }}>
      {verdict}
    </span>
  );
}
