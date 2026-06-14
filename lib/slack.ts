/**
 * Slack delivery for the approval gate (PLAN §8, §15).
 *
 * Outbound: an interactive Block Kit card with Approve / Reject buttons, posted
 * to a channel when a bot token + channel are configured. Inbound: button clicks
 * hit `/api/slack/interactions`, which verifies the Slack signature and maps the
 * action to the SAME `recordApproval` gate the web/push paths use; a human's
 * one tap, just from where the founder already lives.
 *
 * Config resolves through the runtime overlay (DB-first then env), so the founder
 * pastes the Slack credentials in the dashboard like every other integration.
 */
import { createHmac } from "node:crypto";
import { setting } from "@/lib/runtime-config";
import { safeEqual } from "@/lib/hmac";

export interface SlackConfig {
 botToken: string;
 signingSecret: string;
 channel: string;
}

export function slackConfig(): SlackConfig {
 return {
 botToken: setting("SLACK_BOT_TOKEN"),
 signingSecret: setting("SLACK_SIGNING_SECRET"),
 channel: setting("SLACK_CHANNEL"),
 };
}

/** True when an approval card can actually be delivered to a channel. */
export function slackEnabled(): boolean {
 const c = slackConfig();
 return !!(c.botToken && c.channel);
}

export interface ApprovalCard {
 incidentId: string;
 title: string;
 body: string;
 /** Relative path to the incident detail / approval view. */
 path: string;
}

/** Build the Block Kit blocks for an approval card. */
export function buildApprovalBlocks(card: ApprovalCard): unknown[] {
 const base = setting("APP_BASE_URL");
 const elements: unknown[] = [
 {
 type: "button",
 style: "primary",
 text: { type: "plain_text", text: "Approve & ship" },
 action_id: "warden_approve",
 value: card.incidentId,
 },
 {
 type: "button",
 style: "danger",
 text: { type: "plain_text", text: "Reject" },
 action_id: "warden_reject",
 value: card.incidentId,
 },
 ];
 // Slack requires an absolute URL for link buttons; only add it when we know one.
 if (base) {
 elements.push({
 type: "button",
 text: { type: "plain_text", text: "View details" },
 url: `${base.replace(/\/+$/, "")}${card.path}`,
 });
 }
 return [
 { type: "header", text: { type: "plain_text", text: "Warden: approval needed" } },
 { type: "section", text: { type: "mrkdwn", text: `*${card.title}*\n${card.body}` } },
 {
 type: "context",
 elements: [
 {
 type: "mrkdwn",
 text: "A fix passed verification. Approving means consent to ship.",
 },
 ],
 },
 { type: "actions", elements },
 ];
}

/** Post the approval card to the configured channel. Returns whether Slack accepted it. */
export async function postApprovalCard(card: ApprovalCard, cfg?: SlackConfig): Promise<boolean> {
 const c = cfg ?? slackConfig();
 if (!c.botToken || !c.channel) return false;
 const res = await fetch("https://slack.com/api/chat.postMessage", {
 method: "POST",
 headers: {
 authorization: `Bearer ${c.botToken}`,
 "content-type": "application/json; charset=utf-8",
 },
 body: JSON.stringify({
 channel: c.channel,
 text: `Approval needed: ${card.title}`,
 blocks: buildApprovalBlocks(card),
 }),
 });
 const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
 return !!j.ok;
}

/** Verify the `v0=` HMAC-SHA256 signature Slack sends with every request. */
export function verifySlackSignature(
 raw: string,
 timestamp: string | null,
 signature: string | null,
 signingSecret: string): boolean {
 if (!timestamp || !signature || !signingSecret) return false;
 const expected = "v0=" + createHmac("sha256", signingSecret).update(`v0:${timestamp}:${raw}`).digest("hex");
 return safeEqual(signature, expected);
}

export interface ParsedInteraction {
 action: "approve" | "reject" | null;
 incidentId: string | null;
 user: string;
}

/** Extract the button action + incident id from a Slack interaction payload. */
export function parseInteraction(payloadJson: string): ParsedInteraction {
 try {
 const p = JSON.parse(payloadJson) as {
 actions?: { action_id?: string; value?: string }[];
 user?: { username?: string; id?: string };
 };
 const a = p.actions?.[0];
 const action =
 a?.action_id === "warden_approve"
 ? "approve"
 : a?.action_id === "warden_reject"
 ? "reject"
 : null;
 return { action, incidentId: a?.value ?? null, user: p.user?.username || p.user?.id || "slack" };
 } catch {
 return { action: null, incidentId: null, user: "slack" };
 }
}
