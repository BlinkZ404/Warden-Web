import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createHmac } from "node:crypto";
import { resetDatabase } from "./util";
import { setSettings } from "@/lib/repo/settings";
import { hydrateSettings } from "@/lib/runtime-config";
import { buildApprovalBlocks, parseInteraction, verifySlackSignature } from "@/lib/slack";

type Block = {
 type: string;
 elements?: { action_id?: string; value?: string; url?: string }[];
};

describe("slack approval card", () => {
 beforeEach(async () => {
 await resetDatabase();
 await hydrateSettings();
 });
 afterAll(async () => {
 await resetDatabase();
 await hydrateSettings();
 });

 it("builds Approve/Reject buttons that carry the incident id", () => {
 const blocks = buildApprovalBlocks({
 incidentId: "inc-1",
 title: "Checkout 500",
 body: "fix ready",
 path: "/approve/inc-1",
 }) as Block[];
 const actions = blocks.find((b) => b.type === "actions")!;
 const ids = actions.elements!.map((e) => e.action_id).filter(Boolean);
 expect(ids).toContain("warden_approve");
 expect(ids).toContain("warden_reject");
 expect(actions.elements!.find((e) => e.action_id === "warden_approve")!.value).toBe("inc-1");
 });

 it("adds an absolute View-details link only when APP_BASE_URL is set", async () => {
 await setSettings({ APP_BASE_URL: "https://warden.example.com" });
 await hydrateSettings();
 const blocks = buildApprovalBlocks({
 incidentId: "inc-1",
 title: "t",
 body: "b",
 path: "/approve/inc-1",
 }) as Block[];
 const link = blocks.find((b) => b.type === "actions")!.elements!.find((e) => e.url);
 expect(link!.url).toBe("https://warden.example.com/approve/inc-1");
 });

 it("parses the action + incident id from an interaction payload", () => {
 const payload = JSON.stringify({
 actions: [{ action_id: "warden_approve", value: "inc-9" }],
 user: { username: "founder" },
 });
 expect(parseInteraction(payload)).toEqual({
 action: "approve",
 incidentId: "inc-9",
 user: "founder",
 });
 expect(parseInteraction("{not json").action).toBeNull();
 });

 it("verifies a genuine Slack signature and rejects forgeries", () => {
 const secret = "s3cr3t";
 const ts = "1700000000";
 const raw = "payload=%7B%7D";
 const good = "v0=" + createHmac("sha256", secret).update(`v0:${ts}:${raw}`).digest("hex");
 expect(verifySlackSignature(raw, ts, good, secret)).toBe(true);
 expect(verifySlackSignature(raw, ts, good, "wrong-secret")).toBe(false);
 expect(verifySlackSignature(raw, ts, "v0=deadbeef", secret)).toBe(false);
 expect(verifySlackSignature(raw, null, good, secret)).toBe(false);
 });
});
