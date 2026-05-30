/**
 * Approval notification (PLAN §8, §15: web push / Slack ping → mobile approval).
 *
 * The plumbing is real (web-push with VAPID, dead-subscription cleanup). In
 * simulation mode delivery is recorded to the event log as a `notification`
 * event rather than sent, so the audit trail still shows the founder was
 * pinged without requiring a subscribed device.
 */
import webpush from "web-push";
import { config, live } from "@/lib/config";
import { listSubscriptions, deleteSubscription } from "@/lib/repo/push";
import { logEvent } from "@/lib/events";

/**
 * Reject endpoints that aren't public HTTPS push services. Enforced at EGRESS
 * (right before the outbound request), so a stored row that reached the table by
 * ANY path — not just the validated subscribe route — can't drive a (blind)
 * SSRF. The subscribe route reuses this as a fast-fail.
 */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host === "::1" || host === "169.254.169.254") return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (host.startsWith("fc") || host.startsWith("fd")) return false; // unique-local IPv6
  return true;
}

let vapidReady = false;
function ensureVapid(): boolean {
  if (vapidReady) return true;
  if (config.push.publicKey && config.push.privateKey) {
    webpush.setVapidDetails(
      config.push.subject,
      config.push.publicKey,
      config.push.privateKey,
    );
    vapidReady = true;
  }
  return vapidReady;
}

export interface ApprovalPush {
  incidentId: string;
  title: string;
  body: string;
}

export async function notifyApprovalNeeded(p: ApprovalPush): Promise<void> {
  const url = `/approve/${p.incidentId}`;
  await logEvent(p.incidentId, "notification", "system", {
    channel: live.push() ? "push" : "push (simulated)",
    title: p.title,
    body: p.body,
    url,
  });

  if (!live.push() || !ensureVapid()) return; // simulation: recorded only

  // Validate at the sink: only send to allow-listed public push endpoints,
  // regardless of how the subscription row got there.
  const subs = (await listSubscriptions()).filter((s) => isAllowedPushEndpoint(s.endpoint));
  const payload = JSON.stringify({ title: p.title, body: p.body, url });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await deleteSubscription(s.endpoint);
      }
    }),
  );
}
