/**
 * Sentry webhook ingress (PLAN §7, M2). Verifies the signature (live), de-dupes
 * by fingerprint, creates the incident, and kicks the pipeline.
 *
 * The incident is always enqueued. On a single host (local / a VM) we also drain
 * inline so it reaches the approval gate within this request; on Vercel the
 * pipeline can't run in a function, so we enqueue only and the worker drains it
 * (see shouldDrainInline + docs/operations/deploy-aws.md).
 */
import { normalizeSentryWebhook, verifySignature } from "@/lib/adapters/sentry";
import { ingestError } from "@/lib/ingest";
import { drainJobs, shouldDrainInline } from "@/lib/orchestrator/runner";
import { hydrateSettings, isLiveRuntime, sentryClientSecret } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// In live mode this drains the pipeline inline (LLM + git + tests); give it the
// full function budget. For heavy live workloads, prefer returning 202 and
// draining via the worker/cron (see docs/operations/go-live.md).
export const maxDuration = 300;

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

 // Sentry fires installation / event_alert / metric_alert / comment / seer
 // webhooks alongside issue/error. Only issue/error carry a triagable production
 // error; ack everything else cleanly so the install handshake and alert pings
 // don't get force-fed through the issue normalizer into junk incidents.
 const resource = req.headers.get("sentry-hook-resource");
 if (resource && resource !== "issue" && resource !== "error") {
 return Response.json({ ok: true, ignored: resource }, { status: 200 });
 }

 let payload: unknown;
 try {
 payload = JSON.parse(raw || "{}");
 } catch {
 return Response.json({ error: "invalid JSON" }, { status: 400 });
 }

 const normalized = normalizeSentryWebhook(payload as Parameters<typeof normalizeSentryWebhook>[0]);
 const result = await ingestError(normalized);
 if (shouldDrainInline()) await drainJobs("webhook");

 return Response.json(result, { status: result.deduped ? 200 : 201 });
}
