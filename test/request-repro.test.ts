import { describe, it, expect } from "vitest";
import { getBugByKey } from "@/lib/sim/bugs";
import { normalizeSentryWebhook } from "@/lib/adapters/sentry";
import {
  prepareWorkspace,
  createBranch,
  applyEdit,
  commitAll,
  reproduceRequest,
  prepareBoot,
  destroyWorkspace,
} from "@/lib/adapters/workspace";

describe("request-replay reproduction (boot the app, replay the failing request)", () => {
  it("reads the stack trace and request from the Sentry 'error' webhook (data.error, no issue summary)", () => {
    const norm = normalizeSentryWebhook({
      data: {
        // the "error" webhook delivers the full event here, with NO data.issue
        error: {
          event_id: "abc123",
          project: "notehex-warden-demo",
          metadata: { type: "TypeError", value: "t.trim(...).toLowerCasee is not a function" },
          exception: {
            values: [
              {
                type: "TypeError",
                value: "t.trim(...).toLowerCasee is not a function",
                stacktrace: {
                  frames: [
                    {
                      function: "normalizeEmail",
                      filename: "app:///lib/auth/normalizeEmail.ts",
                      in_app: true,
                    },
                  ],
                },
              },
            ],
          },
          request: {
            method: "POST",
            url: "https://notehex-warden-demo.vercel.app/api/auth/sign-in",
            data: { email: "x@y.com" },
          },
        },
      },
    });
    expect(norm.errorType).toBe("TypeError");
    // the `app:///` prefix is stripped so the path resolves in the cloned repo
    expect(norm.culpritFile).toBe("lib/auth/normalizeEmail.ts");
    expect(norm.culpritFunction).toBe("normalizeEmail");
    expect(norm.service).toBe("notehex-warden-demo");
    expect(norm.httpRequest).toEqual({
      method: "POST",
      path: "/api/auth/sign-in",
      body: { email: "x@y.com" },
    });
  });

  it("reproduces the checkout 500 over real HTTP, then confirms the fix clears it", async () => {
    const bug = getBugByKey("checkout-missing-price")!;
    const id = "request-repro-checkout";
    const ws = await prepareWorkspace(id, bug);

    // A cart with a free-gift line item (no price) drives the production TypeError
    // through the REAL /api/checkout handler -> computeCheckoutTotal. This is the
    // deep path the function-call descriptor can't always recover; replaying the
    // request reproduces it regardless.
    const req = {
      method: "POST",
      path: "/api/checkout",
      body: { items: [{ sku: "GIFT", quantity: 1 }] },
    };

    const before = await reproduceRequest(ws.root, req);
    expect(before.reproduced).toBe(true);
    expect(before.status).toBe(500);

    await createBranch(ws.root, "warden/fix");
    await applyEdit(ws.root, bug.fix);
    await commitAll(ws.root, "fix: guard a line item with no price");

    const after = await reproduceRequest(ws.root, req);
    expect(after.reproduced).toBe(false);
    expect(after.status).toBe(200);

    await destroyWorkspace(id);
  }, 30_000);

  it("captures the HTTP request from a real-shaped Sentry event and replays it", async () => {
    const norm = normalizeSentryWebhook({
      data: {
        issue: { id: "1", project: "checkout-service", metadata: { type: "TypeError", value: "boom" } },
        event: {
          exception: {
            values: [
              {
                stacktrace: {
                  frames: [
                    { function: "computeCheckoutTotal", filename: "app:///src/checkout.js", in_app: true },
                  ],
                },
              },
            ],
          },
          // an absolute URL is reduced to its path; the body is the captured args
          request: {
            method: "POST",
            url: "https://shop.example.com/api/checkout",
            data: { items: [{ sku: "GIFT", quantity: 1 }] },
          },
        },
      },
    });
    expect(norm.httpRequest).toEqual({
      method: "POST",
      path: "/api/checkout",
      body: { items: [{ sku: "GIFT", quantity: 1 }] },
    });

    // The request captured from the event, replayed against the booted app,
    // reproduces the real crash; this is the path a live web incident runs.
    const bug = getBugByKey("checkout-missing-price")!;
    const id = "request-repro-from-event";
    const ws = await prepareWorkspace(id, bug);
    const rr = await reproduceRequest(ws.root, norm.httpRequest!);
    expect(rr.reproduced).toBe(true);
    expect(rr.status).toBe(500);
    await destroyWorkspace(id);
  }, 30_000);

  it("prepareBoot is a no-op for a zero-dependency app (no install/build needed)", async () => {
    const bug = getBugByKey("checkout-missing-price")!;
    const id = "prepare-boot-zero-dep";
    const ws = await prepareWorkspace(id, bug);
    const r = await prepareBoot(ws.root);
    expect(r.ok).toBe(true);
    expect(r.detail).toBe("ready");
    await destroyWorkspace(id);
  }, 30_000);
});
