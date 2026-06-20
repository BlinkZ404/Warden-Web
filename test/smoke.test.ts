import { describe, it, expect } from "vitest";
import {
 prepareWorkspace,
 createBranch,
 applyEdit,
 commitAll,
 smokeNewErrors,
 destroyWorkspace,
} from "@/lib/adapters/workspace";
import { getBugByKey } from "@/lib/sim/bugs";
import { synthesizeSmokeInputs, synthesizeRegressionBattery } from "@/lib/agents/smoke";

/**
 * The gate's third leg (AUDIT H4): "no new error signatures introduced". A clean
 * fix leaves the known-good baskets working; a fix that breaks one is caught as a
 * new error; so the gate runs the check instead of hardcoding [].
 */
describe("no-new-errors smoke battery (AUDIT H4)", () => {
 it("clean fix → no new errors; a fix that breaks a known-good input is caught", async () => {
 const bug = getBugByKey("checkout-missing-price")!;
 const descriptor = bug.repro!;
 const smoke = bug.smokeInputs!;
 expect(smoke.length).toBeGreaterThan(0);

 const id = "smoke-checkout";
 const ws = await prepareWorkspace(id, bug);
 await createBranch(ws.root, "warden/fix");
 await applyEdit(ws.root, bug.fix);
 await commitAll(ws.root, "fix: handle missing price");

 // The real fix: every known-good basket still computes; no regressions.
 expect(await smokeNewErrors(ws.root, descriptor, smoke)).toEqual([]);

 // A fix that throws on a normal basket is caught as a new error signature.
 await applyEdit(ws.root, {
 file: "src/checkout.js",
 find: "const unit = item.price?.amount ?? 0;",
 replace: "const unit = item.price.amount.nope.nope;",
 });
 const found = await smokeNewErrors(ws.root, descriptor, smoke);
 expect(found.length).toBeGreaterThan(0);
 expect(found).toContain("TypeError");

 await destroyWorkspace(id);
 });
});

describe("synthesizeSmokeInputs", () => {
 it("always exercises the captured request first", () => {
  const cart = { taxRate: 0.1, items: [{ sku: "X", quantity: 1 }] };
  expect(synthesizeSmokeInputs([cart])[0]).toEqual([cart]);
 });
 it("perturbs each leading-object field, absent and null", () => {
  const out = synthesizeSmokeInputs([{ a: 1, b: 2 }]);
  expect(out).toContainEqual([{ b: 2 }]);
  expect(out).toContainEqual([{ a: null, b: 2 }]);
  expect(out).toContainEqual([{ a: 1 }]);
  expect(out).toContainEqual([{ a: 1, b: null }]);
  expect(out).toHaveLength(5);
 });
 it("preserves trailing positional args while perturbing the first", () => {
  const out = synthesizeSmokeInputs([{ a: 1 }, "ctx"]);
  expect(out).toContainEqual([{}, "ctx"]);
  expect(out).toContainEqual([{ a: null }, "ctx"]);
 });
 it("varies arrays and primitives", () => {
  expect(synthesizeSmokeInputs([[1, 2, 3]])).toContainEqual([[]]);
  expect(synthesizeSmokeInputs([[1, 2, 3]])).toContainEqual([[1]]);
  expect(synthesizeSmokeInputs(["hello"])).toContainEqual([""]);
  expect(synthesizeSmokeInputs([5])).toContainEqual([0]);
  expect(synthesizeSmokeInputs([5])).toContainEqual([-1]);
 });
 it("caps the battery and never drops the original", () => {
  const out = synthesizeSmokeInputs([{ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }]);
  expect(out.length).toBeLessThanOrEqual(8);
  expect(out[0]).toEqual([{ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }]);
 });
});

describe("synthesizeRegressionBattery (test-less repo path)", () => {
 it("a real fix introduces no synthesized regressions", async () => {
  const bug = getBugByKey("checkout-missing-price")!;
  const id = "smoke-synth-checkout";
  const ws = await prepareWorkspace(id, bug);
  await createBranch(ws.root, "warden/fix");
  await applyEdit(ws.root, bug.fix);
  await commitAll(ws.root, "fix: handle missing price");

  const result = await synthesizeRegressionBattery(ws.root, bug.repro!, "main", "warden/fix");
  expect(result.inputs).toBeGreaterThan(0);
  expect(result.newErrors).toEqual([]);

  await destroyWorkspace(id);
 });
});
