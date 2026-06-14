/**
 * Slack interactivity endpoint. A button click on the approval card lands here;
 * we verify Slack's request signature, then map Approve/Reject to the SAME
 * `recordApproval` human gate the web + push paths use. No new authority path; * a Slack tap is just a human decision recorded from a different surface.
 */
import { hydrateSettings, setting } from "@/lib/runtime-config";
import { verifySlackSignature, parseInteraction } from "@/lib/slack";
import { recordApproval, ApprovalStateError } from "@/lib/approval";
import { drainJobs } from "@/lib/orchestrator/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
 const raw = await req.text();
 await hydrateSettings();

 const secret = setting("SLACK_SIGNING_SECRET");
 if (!secret) {
 return Response.json({ error: "slack not configured" }, { status: 503 });
 }

 const ts = req.headers.get("x-slack-request-timestamp");
 const sig = req.headers.get("x-slack-signature");
 // Replay guard: reject anything older than five minutes before checking HMAC.
 const now = Math.floor(Date.now() / 1000);
 if (!ts || !Number.isFinite(Number(ts)) || Math.abs(now - Number(ts)) > 300) {
 return Response.json({ error: "stale request" }, { status: 401 });
 }
 if (!verifySlackSignature(raw, ts, sig, secret)) {
 return Response.json({ error: "bad signature" }, { status: 401 });
 }

 const payload = new URLSearchParams(raw).get("payload");
 if (!payload) return Response.json({ error: "missing payload" }, { status: 400 });

 const { action, incidentId, user } = parseInteraction(payload);
 if (!action || !incidentId) {
 return Response.json({ text: "Unrecognized action." });
 }

 try {
 await recordApproval({
 incidentId,
 decision: action,
 decidedBy: `slack:${user}`,
 channel: "slack",
 });
 } catch (e) {
 if (e instanceof ApprovalStateError) {
 return Response.json({ replace_original: false, text: `Already handled: ${e.message}` });
 }
 throw e;
 }

 await drainJobs("slack");
 return Response.json({
 replace_original: true,
 text:
 action === "approve"
 ? `✅ Approved by ${user}. Shipping the verified fix.`
 : `🚫 Rejected by ${user}.`,
 });
}
