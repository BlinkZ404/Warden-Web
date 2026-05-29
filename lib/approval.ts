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
  channel?: string; // 'push' | 'web' | 'slack' | 'script'
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

  const approval = await createApproval({
    incident_id: incident.id,
    fix_attempt_id: fa.id,
    decision: input.decision,
    decided_by: input.decidedBy,
    channel: input.channel ?? "web",
  });
  await logEvent(incident.id, "approval", `human:${input.decidedBy}`, {
    decision: input.decision,
    channel: input.channel ?? "web",
    fixAttemptId: fa.id,
  });

  if (input.decision === "approve") {
    await bumpScorecard(fa.agent, "fixer", { human_approved: 1 });
    await transition(incident.id, "approved", `human:${input.decidedBy}`);
    await enqueue(incident.id); // resume: approved → deploying → verifying_prod → resolved
  } else {
    await transition(incident.id, "dismissed", `human:${input.decidedBy}`, {
      reason: "human rejected the fix",
    });
  }

  return approval;
}
