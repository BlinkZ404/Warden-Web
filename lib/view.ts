/**
 * Read-model assemblers shared by the API routes and the dashboard server
 * components. Pure reads; never mutate.
 */
import { query } from "@/lib/db/client";
import { getIncident, listIncidents } from "@/lib/repo/incidents";
import { listEvents } from "@/lib/repo/events";
import {
  latestInvestigation,
  latestFixAttempt,
  listReviews,
  latestVerification,
  latestDeployment,
  latestApproval,
  getOutcome,
} from "@/lib/repo/artifacts";
import type {
  Incident,
  EventRow,
  Investigation,
  FixAttempt,
  Review,
  Verification,
  Deployment,
  Approval,
  Outcome,
} from "@/lib/db/types";

export interface IncidentBundle {
  incident: Incident;
  investigation: Investigation | null;
  fixAttempt: FixAttempt | null;
  reviews: Review[]; // the reviewer panel (1–3)
  verification: Verification | null;
  deployment: Deployment | null;
  approval: Approval | null;
  outcome: Outcome | null;
  events: EventRow[];
}

export async function getIncidentBundle(id: string): Promise<IncidentBundle | null> {
  const incident = await getIncident(id);
  if (!incident) return null;
  const fixAttempt = await latestFixAttempt(id);
  return {
    incident,
    investigation: await latestInvestigation(id),
    fixAttempt,
    reviews: fixAttempt ? await listReviews(fixAttempt.id) : [],
    verification: fixAttempt ? await latestVerification(fixAttempt.id) : null,
    deployment: fixAttempt ? await latestDeployment(fixAttempt.id) : null,
    approval: await latestApproval(id),
    outcome: await getOutcome(id),
    events: await listEvents(id),
  };
}

export interface IncidentRow {
  id: string;
  title: string;
  service: string | null;
  severity: string | null;
  status: Incident["status"];
  created_at: Date;
  updated_at: Date;
  reviews_total: number;
  reviews_approved: number;
  test_passed: boolean | null;
  seen_before: boolean;
}

/** One row per incident for the list view, with a few joined signals. */
export async function listIncidentRows(limit = 100): Promise<IncidentRow[]> {
  const incidents = await listIncidents(limit);
  if (incidents.length === 0) return [];
  const ids = incidents.map((i) => i.id);

  const panel = await query<{ incident_id: string; total: number; approved: number }>(
    `WITH latest_fa AS (
       SELECT DISTINCT ON (incident_id) id, incident_id
       FROM fix_attempts WHERE incident_id = ANY($1)
       ORDER BY incident_id, created_at DESC
     )
     SELECT fa.incident_id,
            count(r.*)::int AS total,
            count(*) FILTER (WHERE r.verdict = 'approve')::int AS approved
     FROM latest_fa fa JOIN reviews r ON r.fix_attempt_id = fa.id
     GROUP BY fa.incident_id`,
    [ids],
  );
  const tests = await query<{ incident_id: string; test_passed: boolean }>(
    `WITH latest_fa AS (
       SELECT DISTINCT ON (incident_id) id, incident_id
       FROM fix_attempts WHERE incident_id = ANY($1)
       ORDER BY incident_id, created_at DESC
     )
     SELECT DISTINCT ON (fa.incident_id) fa.incident_id, v.test_passed
     FROM latest_fa fa JOIN verifications v ON v.fix_attempt_id = fa.id
     ORDER BY fa.incident_id, v.checked_at DESC`,
    [ids],
  );
  const seen = await query<{ incident_id: string }>(
    `SELECT DISTINCT incident_id FROM events
     WHERE type = 'memory' AND incident_id = ANY($1)`,
    [ids],
  );

  const panelMap = new Map(panel.map((p) => [p.incident_id, p]));
  const testMap = new Map(tests.map((t) => [t.incident_id, t.test_passed]));
  const seenSet = new Set(seen.map((s) => s.incident_id));

  return incidents.map((i) => ({
    id: i.id,
    title: i.title,
    service: i.service,
    severity: i.severity,
    status: i.status,
    created_at: i.created_at,
    updated_at: i.updated_at,
    reviews_total: panelMap.get(i.id)?.total ?? 0,
    reviews_approved: panelMap.get(i.id)?.approved ?? 0,
    test_passed: testMap.get(i.id) ?? null,
    seen_before: seenSet.has(i.id),
  }));
}

export interface AuditRow {
  id: string;
  type: string;
  actor: string;
  payload: Record<string, unknown>;
  created_at: Date;
  incident_id: string;
  incident_title: string;
}

/** The global audit feed: every event across all incidents, newest first, with
 *  the incident title joined for the cross-incident log view. */
export async function listAuditFeed(limit = 200): Promise<AuditRow[]> {
  return query<AuditRow>(
    `SELECT e.id::text, e.type, e.actor, e.payload, e.created_at,
            e.incident_id::text, COALESCE(i.title, '') AS incident_title
       FROM events e
       LEFT JOIN incidents i ON i.id = e.incident_id
      ORDER BY e.id DESC
      LIMIT $1`,
    [limit],
  );
}
