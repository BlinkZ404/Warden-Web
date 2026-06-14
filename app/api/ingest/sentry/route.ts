/**
 * Sentry webhook ingress (PLAN §7, M2). Verifies the signature (live), de-dupes
 * by fingerprint, creates the incident, and kicks the pipeline.
 *
 * In production this would return 202 and let a worker drain the queue; for the
 * demo we drain inline so the incident reaches the approval gate immediately.
 */
import { normalizeSentryWebhook, verifySignature } from "@/lib/adapters/sentry";
import { ingestError } from "@/lib/ingest";
import { drainJobs } from "@/lib/orchestrator/runner";
import { hydrateSettings, isLiveRuntime, sentryClientSecret } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
 const raw = await req.text();

 // Resolve mode + secret from the saved settings before gating the request.
 await hydrateSettings();

 // In live mode the public webhook is HARD-gated: a missing secret is a
 // misconfiguration (don't silently accept unsigned payloads), and every
 // request must carry a valid signature. (Simulation accepts synthetic events.)
 if (isLiveRuntime()) {
 const secret = sentryClientSecret();
 if (!secret) {
 return Response.json({ error: "sentry ingress misconfigured" }, { status: 503 });
 }
 const sig = req.headers.get("sentry-hook-signature");
 if (!verifySignature(raw, sig, secret)) {
 return Response.json({ error: "invalid signature" }, { status: 401 });
 }
 }

 let payload: unknown;
 try {
 payload = JSON.parse(raw || "{}");
 } catch {
 return Response.json({ error: "invalid JSON" }, { status: 400 });
 }

 const normalized = normalizeSentryWebhook(payload as Parameters<typeof normalizeSentryWebhook>[0]);
 const result = await ingestError(normalized);
 await drainJobs("webhook");

 return Response.json(result, { status: result.deduped ? 200 : 201 });
}
