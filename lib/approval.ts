/**
 * The human gate (PLAN §5.1, §5.2, M8).
 *
 * Agents have NO standing deploy authority. The ONLY thing that moves an
 * incident from awaiting_approval to approved is a human-issued decision
 * recorded here as an `approvals` row. The orchestrator's check is identical
 * regardless of who wrote the row (this is what lets an unattended demo inject a
 * scripted approval while preserving the exact same gate in production).
 *
 * Approval == consent to ship, NOT a claim the code was vetted by a human (§5.2).
 */
import { getIncident } from "@/lib/repo/incidents";
import { latestFixAttempt, createApproval } from "@/lib/repo/artifacts";
import { bumpScorecard } from "@/lib/repo/scorecard";
import { transition } from "@/lib/statemachine";
import { enqueue } from "@/lib/repo/jobs";
import { logEvent } from "@/lib/events";

export interface ApprovalInput {
  incidentId: string;
  decision: "approve" | "reject";
  decidedBy: string; // user id (or 'demo-script' for the unattended demo)
  channel?: string; // 'push' | 'web' | 'slack' | 'script' | 'auto'
  // Event/transition actor; defaults to `human:<decidedBy>`. Autopilot passes
  // `system:auto-approve` so the audit log shows who really decided.
  actor?: string;
  // Whether to enqueue a resume job after approving. The HTTP route needs this
  // (it runs outside the orchestrator loop); an in-loop auto-approve sets false
  // so the same drain cycle carries on to deploy without a redundant job.
  enqueueResume?: boolean;
}

export class ApprovalStateError extends Error {}

export async function recordApproval(input: ApprovalInput) {
  const incident = await getIncident(input.incidentId);
  if (!incident) throw new ApprovalStateError("incident not found");
  if (incident.status !== "awaiting_approval") {
    throw new ApprovalStateError(
      `incident is not awaiting approval (status=${incident.status})`,
    );
  }
  const fa = await latestFixAttempt(incident.id);
  if (!fa) throw new ApprovalStateError("no fix attempt to approve");

  const actor = input.actor ?? `human:${input.decidedBy}`;
  const channel = input.channel ?? "web";
  const approval = await createApproval({
    incident_id: incident.id,
    fix_attempt_id: fa.id,
    decision: input.decision,
    decided_by: input.decidedBy,
    channel,
  });
  await logEvent(incident.id, "approval", actor, {
    decision: input.decision,
    channel,
    fixAttemptId: fa.id,
  });

  if (input.decision === "approve") {
    await bumpScorecard(fa.agent, "fixer", { human_approved: 1 });
    await transition(incident.id, "approved", actor);
    // resume: approved → deploying → verifying_prod → resolved
    if (input.enqueueResume !== false) await enqueue(incident.id);
  } else {
    await transition(incident.id, "dismissed", actor, {
      reason: "fix rejected",
    });
  }

  return approval;
}
