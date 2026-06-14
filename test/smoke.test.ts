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
