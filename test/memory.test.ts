import { describe, it, expect, beforeEach } from "vitest";
import { resetDatabase } from "./util";
import { createIncident, setEmbedding, findSimilar } from "@/lib/repo/incidents";

/** A 1536-dim vector with values only on the first two dims. */
function vec(d0: number, d1: number): number[] {
  const v = new Array<number>(1536).fill(0);
  v[0] = d0;
  v[1] = d1;
  return v;
}

describe("incident memory: pgvector similarity + threshold (audit M7)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("findSimilar respects the cosine threshold against real pgvector SQL", async () => {
    const probe = vec(1, 0);
    const near = vec(0.95, Math.sqrt(1 - 0.95 ** 2)); // cosine ≈ 0.95 to probe
    const far = vec(0.88, Math.sqrt(1 - 0.88 ** 2)); // cosine ≈ 0.88 to probe

    const a = await createIncident({ fingerprint: "fp-near", title: "near" });
    const b = await createIncident({ fingerprint: "fp-far", title: "far" });
    await setEmbedding(a.id, near);
    await setEmbedding(b.id, far);

    // The 0.92 threshold the "seen before" memory event uses (steps.ts).
    const hits = await findSimilar(probe, { minSimilarity: 0.92, limit: 5 });
    const ids = hits.map((h) => h.id);
    expect(ids).toContain(a.id); // 0.95 ≥ 0.92
    expect(ids).not.toContain(b.id); // 0.88 < 0.92

    const aHit = hits.find((h) => h.id === a.id)!;
    expect(Number(aHit.similarity)).toBeCloseTo(0.95, 2);
  });
});
