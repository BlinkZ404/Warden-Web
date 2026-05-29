import { describe, it, expect, beforeEach } from "vitest";
import { resetDatabase } from "./util";
import {
  guardMutation,
  assertProposable,
  BlockedSqlError,
  dryRunMutation,
} from "@/lib/policy/sql-guard";
import { consensusDecision, verificationGate } from "@/lib/policy/gate";
import { localEmbed, incidentEmbeddingText } from "@/lib/memory/embeddings";
import { createIncident, getIncident } from "@/lib/repo/incidents";

describe("data-mutation guard (§10)", () => {
  it("blocks unscoped UPDATE/DELETE and all DDL", () => {
    expect(guardMutation("UPDATE orders SET paid = true").allowed).toBe(false);
    expect(guardMutation("DELETE FROM orders").allowed).toBe(false);
    expect(guardMutation("DROP TABLE orders").allowed).toBe(false);
    expect(guardMutation("TRUNCATE orders").allowed).toBe(false);
    expect(() => assertProposable("DELETE FROM orders")).toThrow(BlockedSqlError);
  });

  it("allows scoped writes and reads (still requires dry-run + human + snapshot)", () => {
    expect(guardMutation("UPDATE orders SET paid = true WHERE id = 7").allowed).toBe(true);
    expect(guardMutation("SELECT * FROM orders").allowed).toBe(true);
  });

  it("dry-run reports affected rows and rolls back (nothing persists)", async () => {
    await resetDatabase();
    const inc = await createIncident({ fingerprint: "fp-guard", title: "Guard test" });

    const result = await dryRunMutation(
      "UPDATE incidents SET title = 'CHANGED' WHERE id = $1",
      [inc.id],
      { maxRows: 100 },
    );
    expect(result.kind).toBe("update");
    expect(result.rowcount).toBe(1);
    expect(result.exceededThreshold).toBe(false);
    expect(result.plan.length).toBeGreaterThan(0);

    // The ROLLBACK means the title is unchanged.
    expect((await getIncident(inc.id))!.title).toBe("Guard test");
  });
});

describe("gate logic (§5.3, §5.4, §10)", () => {
  it("verification gate passes only when all conditions hold", () => {
    expect(verificationGate({ test_passed: true, error_recurred: false, new_errors: [] }).pass).toBe(true);
    expect(verificationGate({ test_passed: false, error_recurred: false, new_errors: [] }).pass).toBe(false);
    expect(verificationGate({ test_passed: true, error_recurred: true, new_errors: [] }).pass).toBe(false);
    expect(verificationGate({ test_passed: true, error_recurred: false, new_errors: ["x"] }).pass).toBe(false);
  });

  it("consensus: only approve proceeds; disagreement escalates", () => {
    expect(consensusDecision("approve")).toMatchObject({ proceed: true, escalate: false });
    expect(consensusDecision("uncertain")).toMatchObject({ proceed: false, escalate: true });
    expect(consensusDecision("reject")).toMatchObject({ proceed: false, escalate: true });
  });
});

describe("incident memory embedding (§10)", () => {
  const cosine = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);

  it("identical incidents embed to (near) identical vectors; different ones diverge", () => {
    const a = localEmbed(
      incidentEmbeddingText({ title: "TypeError in checkout", service: "checkout", fingerprint: "fp-a" }),
    );
    const aSame = localEmbed(
      incidentEmbeddingText({ title: "TypeError in checkout", service: "checkout", fingerprint: "fp-a" }),
    );
    const b = localEmbed(
      incidentEmbeddingText({ title: "NullPointer in billing", service: "billing", fingerprint: "fp-b" }),
    );
    expect(cosine(a, aSame)).toBeCloseTo(1, 5);
    expect(cosine(a, b)).toBeLessThan(0.5);
  });
});
