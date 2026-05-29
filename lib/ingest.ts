/**
 * Incident intake (PLAN §7, M2). De-dupes by fingerprint, creates the incident
 * + first audit event, and enqueues a job. Shared by the live Sentry webhook
 * and the simulation error source.
 */
import {
  findActiveByFingerprint,
  createIncident,
  touchLastSeen,
} from "@/lib/repo/incidents";
import { logEvent } from "@/lib/events";
import { enqueue } from "@/lib/repo/jobs";
import type { NormalizedError } from "@/lib/adapters/sentry";

export interface IngestResult {
  incidentId: string;
  deduped: boolean;
}

export async function ingestError(err: NormalizedError): Promise<IngestResult> {
  const existing = await findActiveByFingerprint(err.fingerprint);
  if (existing) {
    await touchLastSeen(existing.id, err.lastSeen);
    await logEvent(existing.id, "duplicate", err.source, {
      externalId: err.externalId,
      note: "duplicate occurrence suppressed (de-duped by fingerprint)",
    });
    return { incidentId: existing.id, deduped: true };
  }

  try {
    const incident = await createIncident({
      source: err.source,
      external_id: err.externalId,
      fingerprint: err.fingerprint,
      title: err.title,
      service: err.service,
      severity: err.severity,
      first_seen: err.firstSeen,
      last_seen: err.lastSeen,
    });
    await logEvent(incident.id, "ingest", "sentry", {
      errorType: err.errorType,
      errorMessage: err.errorMessage,
      culpritFile: err.culpritFile,
      externalId: err.externalId,
      severity: err.severity,
    });
    await enqueue(incident.id);
    return { incidentId: incident.id, deduped: false };
  } catch (e) {
    // Concurrent ingest of the same fingerprint loses the race to the partial
    // unique index — treat as a duplicate (the DB enforced our invariant).
    if (isUniqueViolation(e)) {
      const now = await findActiveByFingerprint(err.fingerprint);
      if (now) {
        await touchLastSeen(now.id, err.lastSeen);
        return { incidentId: now.id, deduped: true };
      }
    }
    throw e;
  }
}

function isUniqueViolation(e: unknown): boolean {
  return !!e && typeof e === "object" && "code" in e && (e as { code: string }).code === "23505";
}
