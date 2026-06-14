/** Web-push subscription registration for the approval PWA (PLAN §8/§15). */
import { saveSubscription } from "@/lib/repo/push";
import { config } from "@/lib/config";
import { isAllowedPushEndpoint } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
 // The browser needs the VAPID public key to create a subscription.
 return Response.json({ publicKey: config.push.publicKey || null });
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
