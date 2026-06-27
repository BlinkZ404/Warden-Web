import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  prepareWorkspace,
  createBranch,
  applyEdit,
  commitAll,
  runTests,
  reproduce,
  reproduceCall,
  diffStat,
  fileHistory,
  findFilesContaining,
  destroyWorkspace,
} from "@/lib/adapters/workspace";
import { getBugByKey } from "@/lib/sim/bugs";
import { errorSymbol } from "@/lib/agents/fixer";

/**
 * This proves the *real* part of simulation mode: injecting a seeded bug makes
 * the target app genuinely fail, and applying the fix patch genuinely repairs
 * it (tests pass + the production-failing request stops throwing). The
 * verification gate is built on exactly these primitives.
 */
describe("workspace adapter: real inject/fix/verify", () => {
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
    await createBranch(ws.root, "warden/fix");
    await applyEdit(ws.root, bug.fix);
    await commitAll(ws.root, "fix: handle line items without a price");

    // fixed
    expect((await runTests(ws.root)).code).toBe(0);
    expect((await reproduce(ws.root, bug.reproScenario, bug.triggeringInput)).code).toBe(0);

    // scope is small + touches the culprit file
    const stat = await diffStat(ws.root, "main", "warden/fix");
    expect(stat.files).toEqual(["src/checkout.js"]);
    expect(stat.filesChanged).toBe(1);

    // "recently changed on main" signal for the Reviewer
    const hist = await fileHistory(ws.root, "src/checkout.js", { ref: "main" });
    expect(hist[0].subject).toContain("multi-currency");

    await destroyWorkspace(id);
  });

  it("generic --call reproduction: fail before fix, pass after (no named scenario)", async () => {
    // The live-seam engine: reproduce straight from a {module, export, args}
    // descriptor: the shape a Sentry frame + captured request yields, with no
    // hardcoded scenario. Proves the gate can verify a catalog-less incident.
    const bug = getBugByKey("checkout-missing-price")!;
    const descriptor = bug.repro!;
    const id = "wstest-call";
    const ws = await prepareWorkspace(id, bug);

    // buggy production main: the captured call throws the original error
    const before = await reproduceCall(ws.root, descriptor);
    expect(before.code).toBe(1);
    expect(before.stderr).toContain("TypeError");

    await createBranch(ws.root, "warden/fix");
    await applyEdit(ws.root, bug.fix);
    await commitAll(ws.root, "fix: handle line items without a price");

    // fixed: the same generic call stops throwing
    expect((await reproduceCall(ws.root, descriptor)).code).toBe(0);

    await destroyWorkspace(id);
  });

  it("discount bug: fail before fix, pass after", async () => {
    const bug = getBugByKey("discount-unknown-code")!;
    const id = "wstest-discount";
    const ws = await prepareWorkspace(id, bug);

    expect((await reproduce(ws.root, bug.reproScenario, bug.triggeringInput)).code).toBe(1);

    await createBranch(ws.root, "warden/fix");
    await applyEdit(ws.root, bug.fix);
    await commitAll(ws.root, "fix: ignore unknown discount codes");

    expect((await reproduce(ws.root, bug.reproScenario, bug.triggeringInput)).code).toBe(0);
    expect((await runTests(ws.root)).code).toBe(0);

    await destroyWorkspace(id);
  });

  it("applyEdit + commitAll are idempotent on a crash-retry (no throw, no duplicate commit)", async () => {
    const bug = getBugByKey("checkout-missing-price")!;
    const id = "wstest-idem";
    const ws = await prepareWorkspace(id, bug);
    await createBranch(ws.root, "warden/fix");
    await applyEdit(ws.root, bug.fix);
    const sha1 = await commitAll(ws.root, "fix");

    // Re-run the same edit (simulating a retry after a crash that already
    // applied + committed it): no anchor left, but the result is present.
    await applyEdit(ws.root, bug.fix); // idempotent no-op
    const sha2 = await commitAll(ws.root, "fix again"); // clean tree → same HEAD
    expect(sha2).toBe(sha1);

    await destroyWorkspace(id);
  });

  it("runTests reports tests collected; an empty repo reports 0 (gate must fail closed)", async () => {
    const bug = getBugByKey("checkout-missing-price")!;
    const id = "wstest-count";
    const ws = await prepareWorkspace(id, bug);
    const withTests = await runTests(ws.root);
    expect(withTests.testsRun).toBeGreaterThan(0);
    await destroyWorkspace(id);

    const empty = await mkdtemp(join(tmpdir(), "ns-notests-"));
    const noTests = await runTests(empty);
    expect(noTests.code).toBe(0); // node --test exits 0 even with zero tests…
    expect(noTests.testsRun).toBe(0); // …but we detect that nothing ran
    await rm(empty, { recursive: true, force: true });
  });
});

/**
 * The fixer pins the bug from the repo it cloned rather than trusting a (source-
 * mapped, possibly inlined) frame path: pull a distinctive symbol from the error,
 * then grep the workspace for the file that actually holds it.
 */
describe("culprit confirmation from the cloned repo", () => {
  it("errorSymbol extracts the missing symbol from common runtime errors", () => {
    expect(errorSymbol("TypeError: n.trim(...).toLowerCasee is not a function")).toBe(
      "toLowerCasee",
    );
    expect(errorSymbol("ReferenceError: computeTotal is not defined")).toBe("computeTotal");
    expect(errorSymbol("TypeError: Cannot read properties of undefined (reading 'price')")).toBe(
      "price",
    );
    expect(errorSymbol("RangeError: invalid array length")).toBeUndefined();
  });

  it("findFilesContaining locates the bug file by its distinctive symbol", async () => {
    const bug = getBugByKey("signin-email-typo")!;
    const id = "wstest-grep";
    const ws = await prepareWorkspace(id, bug);
    // The injected production state holds the typo'd method; grep finds its file,
    // even though the Sentry frame would point at the route that calls it.
    expect(await findFilesContaining(ws.root, "toLowerCasee")).toContain(bug.culpritFile);
    // A symbol absent from the repo yields nothing (caller falls back to the path).
    expect(await findFilesContaining(ws.root, "zzzNoSuchSymbolZzz")).toEqual([]);
    await destroyWorkspace(id);
  });
});
