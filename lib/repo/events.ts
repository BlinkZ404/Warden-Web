import { query, queryOne } from "@/lib/db/client";
import type { EventRow } from "@/lib/db/types";

export interface NewEvent {
  incident_id: string;
  type: string; // 'state_change' | 'agent_action' | 'approval' | 'note' | 'error' | ...
  actor: string; // 'system' | 'claude' | 'codex' | 'human:<id>'
  payload?: Record<string, unknown>;
}

/** Append a row to the immutable audit log (PLAN §6: every transition logs here). */
export async function insertEvent(e: NewEvent): Promise<EventRow> {
  return (await queryOne<EventRow>(
    `INSERT INTO events (incident_id, type, actor, payload)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [e.incident_id, e.type, e.actor, e.payload ?? {}],
  ))!;
}

export async function listEvents(incidentId: string): Promise<EventRow[]> {
  return query<EventRow>(
    "SELECT * FROM events WHERE incident_id = $1 ORDER BY created_at ASC, id ASC",
    [incidentId],
  );
}

export async function listRecentEvents(limit = 200): Promise<EventRow[]> {
  return query<EventRow>(
    "SELECT * FROM events ORDER BY id DESC LIMIT $1",
    [limit],
  );
}
