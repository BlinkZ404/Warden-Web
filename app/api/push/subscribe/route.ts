/** Web-push subscription registration for the approval PWA (PLAN §8/§15). */
import { saveSubscription } from "@/lib/repo/push";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // The browser needs the VAPID public key to create a subscription.
  return Response.json({ publicKey: config.push.publicKey || null });
}

/**
 * Reject endpoints that aren't public HTTPS push services. The stored endpoint
 * later becomes an outbound request in lib/notify, so an attacker-supplied
 * internal/loopback URL would be a (blind) SSRF vector.
 */
function isAllowedPushEndpoint(endpoint: string): boolean {
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

export async function POST(req: Request) {
  const sub = (await req.json().catch(() => null)) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    userId?: string;
  } | null;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return Response.json({ error: "invalid subscription" }, { status: 400 });
  }
  if (!isAllowedPushEndpoint(sub.endpoint)) {
    return Response.json({ error: "endpoint not allowed" }, { status: 400 });
  }
  await saveSubscription({
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_id: sub.userId ?? null,
  });
  return Response.json({ ok: true }, { status: 201 });
}
