/**
 * Higher-level helpers over the append-only event log. State *changes* go
 * through lib/statemachine; these record everything else that happens to an
 * incident (agent actions, errors, notes) so the audit trail in `events` is the
 * complete story of "what happened" (PLAN §6, §13).
 */
import { insertEvent } from "@/lib/repo/events";
import { meterRun } from "@/lib/billing";

/** Which role's assigned model priced each agent action. Reviewer runs price off
 *  the reviewer's own model name (its actor), so they're absent here. */
const ROLE_BY_ACTION: Record<string, string> = {
  investigated: "INVESTIGATOR_MODEL",
  proposed_fix: "FIXER_MODEL",
};

export async function logEvent(
  incidentId: string,
  type: string,
  actor: string,
  payload: Record<string, unknown> = {},
) {
  return insertEvent({ incident_id: incidentId, type, actor, payload });
}

export async function logAgentAction(
  incidentId: string,
  actor: string,
  action: string,
  payload: Record<string, unknown> = {},
) {
  const ev = await logEvent(incidentId, "agent_action", actor, { action, ...payload });
  // Meter this run against the prepaid wallet (managed billing only).
  const roleKey = ROLE_BY_ACTION[action];
  await meterRun(incidentId, roleKey ? { roleKey } : { model: actor });
  return ev;
}

export function logError(
  incidentId: string,
  actor: string,
  message: string,
  payload: Record<string, unknown> = {},
) {
  return logEvent(incidentId, "error", actor, { message, ...payload });
}

export function logNote(
  incidentId: string,
  actor: string,
  message: string,
  payload: Record<string, unknown> = {},
) {
  return logEvent(incidentId, "note", actor, { message, ...payload });
}
