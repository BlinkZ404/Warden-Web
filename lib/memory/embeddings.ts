/**
 * Incident embeddings for pgvector memory (PLAN §10/§13: "have we seen this
 * before?").
 *
 * In simulation mode we use a deterministic local embedding (a signed hashing
 * vectorizer) — no API key, fully offline, and crucially *deterministic*, so a
 * repeat incident embeds to (nearly) the same vector and cosine similarity
 * fires reliably. In live mode this is swapped for a real embeddings API; both
 * produce 1536-dim vectors so the schema is unchanged.
 */
import { live, config } from "@/lib/config";

export const EMBEDDING_DIM = 1536;

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1);
}

/** Deterministic signed hashing vectorizer → L2-normalized 1536-dim vector. */
export function localEmbed(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIM).fill(0);
  const tokens = tokenize(text);
  for (const tok of tokens) {
    const h = fnv1a(tok);
    const idx = h % EMBEDDING_DIM;
    const sign = (h & 0x80000000) !== 0 ? 1 : -1;
    vec[idx] += sign;
  }
  // L2 normalize so cosine distance is well-behaved.
  let norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (norm === 0) norm = 1;
  return vec.map((v) => v / norm);
}

/** The text we embed for an incident — the stable signature of the error. */
export function incidentEmbeddingText(input: {
  title: string;
  service?: string | null;
  fingerprint: string;
}): string {
  return [input.title, input.service ?? "", input.fingerprint].join(" \n ");
}

export interface Embedder {
  name: string;
  embed(text: string): Promise<number[]>;
}

const simEmbedder: Embedder = {
  name: "local-hash",
  async embed(text: string) {
    return localEmbed(text);
  },
};

const liveEmbedder: Embedder = {
  name: "openai-text-embedding-3-small",
  async embed(text: string) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.agents.embeddingApiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
        dimensions: EMBEDDING_DIM,
      }),
    });
    if (!res.ok) throw new Error(`embeddings API ${res.status}`);
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data[0].embedding;
  },
};

export function getEmbedder(): Embedder {
  return live.embeddings() ? liveEmbedder : simEmbedder;
}
