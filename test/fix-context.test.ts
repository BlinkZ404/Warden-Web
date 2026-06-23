import { describe, it, expect } from "vitest";
import { getBugByKey } from "@/lib/sim/bugs";
import {
  prepareWorkspace,
  gatherCallerContext,
  destroyWorkspace,
} from "@/lib/adapters/workspace";

describe("fix context: callers of the culprit file", () => {
  it("surfaces the files that call into the culprit (so a fix preserves their contracts)", async () => {
    const bug = getBugByKey("checkout-missing-price")!;
    const id = "fix-context-callers";
    const ws = await prepareWorkspace(id, bug);

    // server.js imports computeCheckoutTotal from src/checkout.js and calls it,
    // so a rewrite of checkout.js must keep that call site working.
    const ctx = await gatherCallerContext(ws.root, "src/checkout.js");
    expect(ctx).toContain("server.js");
    expect(ctx).toContain("computeCheckoutTotal");

    // A file nothing imports yields no caller context (fail-soft, not an error).
    const none = await gatherCallerContext(ws.root, "does/not/exist.js");
    expect(none).toBe("");

    await destroyWorkspace(id);
  }, 30_000);
});
