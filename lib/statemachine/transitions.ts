import type { IncidentStatus } from "@/lib/db/types";

/**
 * The incident lifecycle (PLAN §6). Only transitions listed here are legal;
 * anything else throws. This is the spine of the product; the orchestrator
 * never "skips ahead" (e.g. detected → deploying is impossible), so there is no
 * code path that ships without passing through verification and approval.
 */
export const TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  detected: ["triaging", "dismissed", "escalated", "failed"],
  triaging: ["investigating", "dismissed", "escalated", "failed"],
  investigating: ["fix_proposed", "escalated", "failed", "dismissed"],
  fix_proposed: ["under_review", "escalated", "failed"],
  // under_review can loop back to fix_proposed: when a reviewer flags an
  // actionable problem (an over-scoped patch), the orchestrator re-proposes a
  // tighter fix with that feedback, bounded by MAX_FIX_ATTEMPTS, before escalating.
  under_review: ["verifying", "fix_proposed", "escalated", "failed"],
  verifying: ["awaiting_approval", "escalated", "failed"],
  // The human gate. Approve → approved; reject → dismissed.
  awaiting_approval: ["approved", "dismissed", "escalated"],
  approved: ["deploying", "failed", "escalated"],
  deploying: ["verifying_prod", "failed", "rolled_back", "escalated"],
  verifying_prod: ["resolved", "rolled_back", "failed"],
  // After an automatic rollback the incident is contained but not fixed.
  rolled_back: ["escalated", "failed", "resolved"],
  // A human can re-route an escalated incident.
  escalated: ["investigating", "dismissed", "resolved", "failed"],
  failed: ["escalated", "dismissed"],
  // A shipped fix can still be reverted by the founder ("one tap to revert")
  // (PLAN tagline, §2, §13). This is a human action, not an automated one; the
  // orchestrator never auto-leaves `resolved` (it stays a boundary).
  resolved: ["rolled_back"],
  dismissed: [],
};

export const TERMINAL: IncidentStatus[] = ["resolved", "dismissed", "failed"];

/**
 * States where the pipeline pauses for something outside the orchestrator:
 * a human decision (awaiting_approval), a human re-route (escalated), or
 * because it's terminal. The worker completes its job at these boundaries.
 */
export const BOUNDARY: IncidentStatus[] = [
  "awaiting_approval",
  "escalated",
  ...TERMINAL,
];

export function isTerminal(s: IncidentStatus): boolean {
  return TERMINAL.includes(s);
}

export function isBoundary(s: IncidentStatus): boolean {
  return BOUNDARY.includes(s);
}

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export class IllegalTransitionError extends Error {
  constructor(
    public from: IncidentStatus,
    public to: IncidentStatus,
  ) {
    super(`Illegal incident transition: ${from} → ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function assertTransition(
  from: IncidentStatus,
  to: IncidentStatus,
): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}
