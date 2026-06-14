import { describe, it, expect } from "vitest";
import { extractReproDescriptor, normalizeModulePath } from "@/lib/agents/repro";
import { normalizeSentryWebhook, syntheticSentryEvent } from "@/lib/adapters/sentry";
import { getBugByKey } from "@/lib/sim/bugs";
import {
 prepareWorkspace,
 createBranch,
 applyEdit,
 commitAll,
 reproduceCall,
 destroyWorkspace,
} from "@/lib/adapters/workspace";

describe("repro extraction; descriptor from a Sentry event (AUDIT C2)", () => {
 it("normalizeModulePath strips Sentry prefixes to a repo-relative path", () => {
 expect(normalizeModulePath("app:///src/checkout.js")).toBe("src/checkout.js");
 expect(normalizeModulePath("webpack-internal:///./src/x.ts")).toBe("src/x.ts");
 expect(normalizeModulePath("/src/x.js")).toBe("src/x.js");
 expect(normalizeModulePath("./a/b.js")).toBe("a/b.js");
 expect(normalizeModulePath("src\\a.js")).toBe("src/a.js");
 });

 it("builds a positional descriptor and fails closed on a missing signal", () => {
 expect(
 extractReproDescriptor({
 culpritFile: "app:///src/checkout.js",
 culpritFunction: "computeCheckoutTotal",
 request: { items: [] },
 })).toEqual({
 module: "src/checkout.js",
 export: "computeCheckoutTotal",
 args: [{ items: [] }],
 });

 // an array request becomes the positional args verbatim
 expect(
 extractReproDescriptor({
 culpritFile: "src/discount.js",
 culpritFunction: "applyDiscount",
 request: [1000, "X", {}],
 })).toEqual({ module: "src/discount.js", export: "applyDiscount", args: [1000, "X", {}] });

 // fail closed when the signal can't replay a call
 expect(extractReproDescriptor({ culpritFile: "src/x.js", request: {} })).toBeNull(); // no fn
 expect(extractReproDescriptor({ culpritFunction: "f", request: {} })).toBeNull(); // no file
 expect(extractReproDescriptor({ culpritFile: "src/x.js", culpritFunction: "f" })).toBeNull(); // no request
 expect(
 extractReproDescriptor({ culpritFile: "src/data.json", culpritFunction: "f", request: {} })).toBeNull(); // not a JS/TS module
 });

 it("threads the frame fn + request through normalize, and the extracted descriptor replays the real crash", async () => {
 const bug = getBugByKey("checkout-missing-price")!;
 const norm = normalizeSentryWebhook(syntheticSentryEvent(bug));

 // the C2 signal survives normalization
 expect(norm.culpritFunction).toBe("computeCheckoutTotal");
 expect(norm.triggeringRequest).toBeTruthy();

 const descriptor = extractReproDescriptor({
 culpritFile: norm.culpritFile,
 culpritFunction: norm.culpritFunction,
 request: norm.triggeringRequest,
 })!;
 expect(descriptor.module).toBe("src/checkout.js");
 expect(descriptor.export).toBe("computeCheckoutTotal");

 // The descriptor came from the EVENT (not the catalog). Prove it actually
 // reproduces the crash on buggy main, then stops once the fix is applied.
 const id = "repro-extract-checkout";
 const ws = await prepareWorkspace(id, bug);

 const before = await reproduceCall(ws.root, descriptor);
 expect(before.code).toBe(1);
 expect(before.stderr).toContain("TypeError");

 await createBranch(ws.root, "warden/fix");
 await applyEdit(ws.root, bug.fix);
 await commitAll(ws.root, "fix: handle line items without a price");

 expect((await reproduceCall(ws.root, descriptor)).code).toBe(0);
 await destroyWorkspace(id);
 });

 it("parses a real-shaped event (stacktrace frames + request), not just the synthetic shortcuts", () => {
 const norm = normalizeSentryWebhook({
 data: {
 issue: {
 id: "1",
 project: "checkout-service",
 metadata: { type: "TypeError", value: "boom" },
 },
 event: {
 exception: {
 values: [
 {
 stacktrace: {
 frames: [
 { function: "handler", filename: "app:///src/server.js", in_app: true },
 {
 function: "computeCheckoutTotal",
 filename: "app:///src/checkout.js",
 in_app: true,
 },
 ],
 },
 },
 ],
 },
 request: { method: "POST", url: "/checkout", data: { items: [{ sku: "X" }] } },
 },
 },
 });

 // picks the LAST in-app frame as the culprit
 expect(norm.culpritFunction).toBe("computeCheckoutTotal");
 expect(norm.culpritFile).toContain("checkout.js");

 const d = extractReproDescriptor({
 culpritFile: norm.culpritFile,
 culpritFunction: norm.culpritFunction,
 request: norm.triggeringRequest,
 })!;
 expect(d).toEqual({
 module: "src/checkout.js",
 export: "computeCheckoutTotal",
 args: [{ items: [{ sku: "X" }] }],
 });
 });
});
