/**
 * Read-model assemblers shared by the API routes and the dashboard server
 * components. Pure reads — never mutate.
 */
import { query } from "@/lib/db/client";
import { getIncident, listIncidents } from "@/lib/repo/incidents";
import { listEvents } from "@/lib/repo/events";
import {
  latestInvestigation,
  latestFixAttempt,
  latestReview,
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
  review: Review | null;
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
    review: fixAttempt ? await latestReview(fixAttempt.id) : null,
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
  reviewer_verdict: string | null;
  test_passed: boolean | null;
  seen_before: boolean;
}

/** One row per incident for the list view, with a few joined signals. */
export async function listIncidentRows(limit = 100): Promise<IncidentRow[]> {
  const incidents = await listIncidents(limit);
  if (incidents.length === 0) return [];
  const ids = incidents.map((i) => i.id);

  const verdicts = await query<{ incident_id: string; verdict: string }>(
    `SELECT DISTINCT ON (fa.incident_id) fa.incident_id, r.verdict
     FROM fix_attempts fa JOIN reviews r ON r.fix_attempt_id = fa.id
     WHERE fa.incident_id = ANY($1)
     ORDER BY fa.incident_id, r.created_at DESC`,
    [ids],
  );
  const tests = await query<{ incident_id: string; test_passed: boolean }>(
    `SELECT DISTINCT ON (fa.incident_id) fa.incident_id, v.test_passed
     FROM fix_attempts fa JOIN verifications v ON v.fix_attempt_id = fa.id
     WHERE fa.incident_id = ANY($1)
     ORDER BY fa.incident_id, v.checked_at DESC`,
    [ids],
  );
  const seen = await query<{ incident_id: string }>(
    `SELECT DISTINCT incident_id FROM events
     WHERE type = 'memory' AND incident_id = ANY($1)`,
    [ids],
  );

  const verdictMap = new Map(verdicts.map((v) => [v.incident_id, v.verdict]));
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
    reviewer_verdict: verdictMap.get(i.id) ?? null,
    test_passed: testMap.get(i.id) ?? null,
    seen_before: seenSet.has(i.id),
  }));
}
