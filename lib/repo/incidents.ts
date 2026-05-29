import { query, queryOne } from "@/lib/db/client";
import { toVectorLiteral } from "@/lib/db/vector";
import type { Incident, IncidentStatus } from "@/lib/db/types";

export interface NewIncident {
  source?: string;
  external_id?: string | null;
  fingerprint: string;
  title: string;
  service?: string | null;
  severity?: string | null;
  first_seen?: Date | null;
  last_seen?: Date | null;
}

export async function createIncident(input: NewIncident): Promise<Incident> {
  const now = new Date();
  return (await queryOne<Incident>(
    `INSERT INTO incidents
       (source, external_id, fingerprint, title, service, severity, first_seen, last_seen)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      input.source ?? "sentry",
      input.external_id ?? null,
      input.fingerprint,
      input.title,
      input.service ?? null,
      input.severity ?? null,
      input.first_seen ?? now,
      input.last_seen ?? now,
    ],
  ))!;
}

export async function getIncident(id: string): Promise<Incident | null> {
  return queryOne<Incident>("SELECT * FROM incidents WHERE id = $1", [id]);
}

/**
 * The active (open) incident for a fingerprint, if any. Mirrors the partial
 * unique index: resolved/dismissed/failed incidents don't count, so a
 * recurrence opens a fresh one.
 */
export async function findActiveByFingerprint(
  fingerprint: string,
): Promise<Incident | null> {
  return queryOne<Incident>(
    `SELECT * FROM incidents
     WHERE fingerprint = $1
       AND status NOT IN ('resolved','dismissed','failed')
     ORDER BY created_at DESC
     LIMIT 1`,
    [fingerprint],
  );
}

export async function listIncidents(limit = 100): Promise<Incident[]> {
  return query<Incident>(
    "SELECT * FROM incidents ORDER BY created_at DESC LIMIT $1",
    [limit],
  );
}

/** Raw status setter. Callers should go through the state machine (lib/statemachine). */
export async function setStatusRaw(
  id: string,
  status: IncidentStatus,
): Promise<void> {
  await query(
    "UPDATE incidents SET status = $2, updated_at = now() WHERE id = $1",
    [id, status],
  );
}

export async function setEmbedding(id: string, vec: number[]): Promise<void> {
  await query(
    "UPDATE incidents SET embedding = $2::vector, updated_at = now() WHERE id = $1",
    [id, toVectorLiteral(vec)],
  );
}

export async function touchLastSeen(id: string, seen: Date): Promise<void> {
  await query(
    "UPDATE incidents SET last_seen = $2, updated_at = now() WHERE id = $1",
    [id, seen],
  );
}

export interface SimilarIncident {
  id: string;
  title: string;
  fingerprint: string;
  status: IncidentStatus;
  created_at: Date;
  similarity: number;
}

/**
 * pgvector cosine nearest-neighbour lookup — the "have we seen this before?"
 * memory (PLAN §10/§13). Returns incidents whose embedding is most similar,
 * excluding the incident itself.
 */
export async function findSimilar(
  embedding: number[],
  opts: { excludeId?: string; limit?: number; minSimilarity?: number } = {},
): Promise<SimilarIncident[]> {
  const rows = await query<SimilarIncident>(
    `SELECT id, title, fingerprint, status, created_at,
            1 - (embedding <=> $1::vector) AS similarity
     FROM incidents
     WHERE embedding IS NOT NULL
       AND ($2::uuid IS NULL OR id <> $2::uuid)
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [toVectorLiteral(embedding), opts.excludeId ?? null, opts.limit ?? 5],
  );
  const min = opts.minSimilarity ?? 0;
  return rows.filter((r) => Number(r.similarity) >= min);
}
