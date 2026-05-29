/** Pure UI helpers — safe to import from client components (no server deps). */
import type { IncidentStatus } from "@/lib/db/types";

export interface Stage {
  key: IncidentStatus;
  label: string;
  who?: string;
}

/** The mainline pipeline (PLAN §6), used for the progress visualization. */
export const PIPELINE_STAGES: Stage[] = [
  { key: "detected", label: "Detected", who: "Sentry" },
  { key: "triaging", label: "Triage", who: "system" },
  { key: "investigating", label: "Investigate", who: "Claude" },
  { key: "fix_proposed", label: "Fix", who: "Claude" },
  { key: "under_review", label: "Review", who: "Codex" },
  { key: "verifying", label: "Verify", who: "tests" },
  { key: "awaiting_approval", label: "Approve", who: "you" },
  { key: "deploying", label: "Deploy", who: "Vercel" },
  { key: "verifying_prod", label: "Verify prod", who: "system" },
  { key: "resolved", label: "Resolved", who: "" },
];

export const OFFRAMPS: IncidentStatus[] = [
  "escalated",
  "rolled_back",
  "failed",
  "dismissed",
];

export function isOfframp(s: IncidentStatus): boolean {
  return OFFRAMPS.includes(s);
}

export function stageIndex(s: IncidentStatus): number {
  if (s === "approved") return PIPELINE_STAGES.findIndex((x) => x.key === "deploying");
  return PIPELINE_STAGES.findIndex((x) => x.key === s);
}

type Tone = "ok" | "warn" | "bad" | "escalate" | "active" | "muted";

const TONE_COLOR: Record<Tone, string> = {
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  bad: "var(--color-bad)",
  escalate: "var(--color-escalate)",
  active: "var(--color-accent)",
  muted: "var(--color-muted)",
};

export function statusMeta(s: IncidentStatus): { label: string; tone: Tone; color: string } {
  const map: Record<IncidentStatus, { label: string; tone: Tone }> = {
    detected: { label: "Detected", tone: "active" },
    triaging: { label: "Triaging", tone: "active" },
    investigating: { label: "Investigating", tone: "active" },
    fix_proposed: { label: "Fix proposed", tone: "active" },
    under_review: { label: "Under review", tone: "active" },
    verifying: { label: "Verifying", tone: "active" },
    awaiting_approval: { label: "Awaiting approval", tone: "warn" },
    approved: { label: "Approved", tone: "active" },
    deploying: { label: "Deploying", tone: "active" },
    verifying_prod: { label: "Verifying in prod", tone: "active" },
    resolved: { label: "Resolved", tone: "ok" },
    failed: { label: "Failed", tone: "bad" },
    rolled_back: { label: "Rolled back", tone: "warn" },
    escalated: { label: "Escalated", tone: "escalate" },
    dismissed: { label: "Dismissed", tone: "muted" },
  };
  const m = map[s];
  return { ...m, color: TONE_COLOR[m.tone] };
}

export function relativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
