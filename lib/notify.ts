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

  const subs = await listSubscriptions();
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
