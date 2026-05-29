/**
 * Higher-level helpers over the append-only event log. State *changes* go
 * through lib/statemachine; these record everything else that happens to an
 * incident (agent actions, errors, notes) so the audit trail in `events` is the
 * complete story of "what happened" (PLAN §6, §13).
 */
import { insertEvent } from "@/lib/repo/events";

export async function logEvent(
  incidentId: string,
  type: string,
  actor: string,
  payload: Record<string, unknown> = {},
) {
  return insertEvent({ incident_id: incidentId, type, actor, payload });
}

export function logAgentAction(
  incidentId: string,
  actor: string,
  action: string,
  payload: Record<string, unknown> = {},
) {
  return logEvent(incidentId, "agent_action", actor, { action, ...payload });
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
