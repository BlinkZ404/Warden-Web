import { withTransaction } from "@/lib/db/client";
import type { IncidentStatus } from "@/lib/db/types";
import { assertTransition } from "@/lib/statemachine/transitions";

export * from "@/lib/statemachine/transitions";

export interface TransitionResult {
  from: IncidentStatus;
  to: IncidentStatus;
  noop: boolean;
}

/**
 * Move an incident to a new status, atomically, recording an append-only
 * `state_change` event (PLAN §6: "every transition writes a row to events").
 *
 * - Locks the incident row (FOR UPDATE) so concurrent workers serialize.
 * - Validates the transition is legal; throws IllegalTransitionError otherwise.
 * - Idempotent: if the incident is already in `to`, it's a no-op (no duplicate
 *   event), which is what makes the orchestrator safely resumable.
 */
export async function transition(
  incidentId: string,
  to: IncidentStatus,
  actor: string,
  payload: Record<string, unknown> = {},
): Promise<TransitionResult> {
  return withTransaction(async (c) => {
    const { rows } = await c.query<{ status: IncidentStatus }>(
      "SELECT status FROM incidents WHERE id = $1 FOR UPDATE",
      [incidentId],
    );
    if (rows.length === 0) throw new Error(`Incident not found: ${incidentId}`);
    const from = rows[0].status;

    if (from === to) return { from, to, noop: true };

    assertTransition(from, to);

    await c.query(
      "UPDATE incidents SET status = $2, updated_at = now() WHERE id = $1",
      [incidentId, to],
    );
    await c.query(
      `INSERT INTO events (incident_id, type, actor, payload)
       VALUES ($1, 'state_change', $2, $3)`,
      [incidentId, actor, { from, to, ...payload }],
    );

    return { from, to, noop: false };
  });
}
