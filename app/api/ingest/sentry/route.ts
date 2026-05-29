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
import { config, live } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();

  if (live.sentry()) {
    const sig = req.headers.get("sentry-hook-signature");
    if (!verifySignature(raw, sig, config.sentry.clientSecret)) {
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
