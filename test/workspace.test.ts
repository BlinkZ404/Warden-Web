import { describe, it, expect } from "vitest";
import {
  prepareWorkspace,
  createBranch,
  applyEdit,
  commitAll,
  runTests,
  reproduce,
  diffStat,
  fileHistory,
  destroyWorkspace,
} from "@/lib/adapters/workspace";
import { getBugByKey } from "@/lib/sim/bugs";

/**
 * This proves the *real* part of simulation mode: injecting a seeded bug makes
 * the target app genuinely fail, and applying the fix patch genuinely repairs
 * it (tests pass + the production-failing request stops throwing). The
 * verification gate is built on exactly these primitives.
 */
describe("workspace adapter — real inject/fix/verify", () => {
  it("checkout bug: fail before fix, pass after", async () => {
    const bug = getBugByKey("checkout-missing-price")!;
    const id = "wstest-checkout";
    const ws = await prepareWorkspace(id, bug);

    // buggy production main
    expect((await runTests(ws.root)).code).not.toBe(0);
    const badRepro = await reproduce(ws.root, bug.reproScenario, bug.triggeringInput);
    expect(badRepro.code).toBe(1);
    expect(badRepro.stderr).toContain("TypeError");

    // fix on a branch
    await createBranch(ws.root, "nightshift/fix");
    await applyEdit(ws.root, bug.fix);
    await commitAll(ws.root, "fix: handle line items without a price");

    // fixed
    expect((await runTests(ws.root)).code).toBe(0);
    expect((await reproduce(ws.root, bug.reproScenario, bug.triggeringInput)).code).toBe(0);

    // scope is small + touches the culprit file
    const stat = await diffStat(ws.root, "main", "nightshift/fix");
    expect(stat.files).toEqual(["src/checkout.js"]);
    expect(stat.filesChanged).toBe(1);

    // "recently changed on main" signal for the Reviewer
    const hist = await fileHistory(ws.root, "src/checkout.js", { ref: "main" });
    expect(hist[0].subject).toContain("multi-currency");

    await destroyWorkspace(id);
  });

  it("discount bug: fail before fix, pass after", async () => {
    const bug = getBugByKey("discount-unknown-code")!;
    const id = "wstest-discount";
    const ws = await prepareWorkspace(id, bug);

    expect((await reproduce(ws.root, bug.reproScenario, bug.triggeringInput)).code).toBe(1);

    await createBranch(ws.root, "nightshift/fix");
    await applyEdit(ws.root, bug.fix);
    await commitAll(ws.root, "fix: ignore unknown discount codes");

    expect((await reproduce(ws.root, bug.reproScenario, bug.triggeringInput)).code).toBe(0);
    expect((await runTests(ws.root)).code).toBe(0);

    await destroyWorkspace(id);
  });
});
