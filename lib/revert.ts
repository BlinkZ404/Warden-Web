/**
 * Founder-initiated one-tap revert (PLAN tagline, §2, §13: "one tap to ship,
 * one tap to revert").
 *
 * Distinct from the automatic rollback on a prod regression (lib/orchestrator):
 * this is a deliberate human action on an already-shipped fix. It re-points the
 * production alias via the same Vercel instant-rollback adapter, records the
 * reversal, and rests the incident at `rolled_back` (no auto-escalation, since
 * the human already decided).
 */
import { getIncident } from "@/lib/repo/incidents";
import {
  latestFixAttempt,
  latestDeployment,
  markDeploymentRolledBack,
  recordOutcome,
} from "@/lib/repo/artifacts";
import { rollback } from "@/lib/adapters/deploy";
import { transition, canTransition } from "@/lib/statemachine";
import { logEvent } from "@/lib/events";

export class RevertStateError extends Error {}

export async function recordRevert(incidentId: string, decidedBy: string) {
  const incident = await getIncident(incidentId);
  if (!incident) throw new RevertStateError("incident not found");
  if (!canTransition(incident.status, "rolled_back")) {
    throw new RevertStateError(`cannot revert from status=${incident.status}`);
  }

  const fa = await latestFixAttempt(incidentId);
  const dep = fa ? await latestDeployment(fa.id) : null;
  if (dep) {
    // Restore the previous-good production deployment (not the shipped fix).
    await rollback(dep.prev_prod_deployment_id ?? "");
    await markDeploymentRolledBack(dep.id);
  }

  await logEvent(incidentId, "rollback", `human:${decidedBy}`, {
    reason: "human-initiated one-tap revert",
    deploymentId: dep?.deployment_id ?? null,
  });
  await recordOutcome({
    incident_id: incidentId,
    resolved: false,
    recurred: false,
    resolution_type: "reverted",
    notes: `Reverted by ${decidedBy} (one tap).`,
  });
  await transition(incidentId, "rolled_back", `human:${decidedBy}`, {
    reason: "human revert",
  });

  return { status: "rolled_back" as const };
}
