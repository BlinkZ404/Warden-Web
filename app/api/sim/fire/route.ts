/**
 * Simulation trigger: fire a seeded bug as if Sentry caught it, then run the
 * pipeline. Powers the dashboard's simulate -> "fire a sample incident" control.
 * Sim-only: disabled in live mode so it can never forge an incident or spend on
 * real LLM/git/deploy work.
 *
 * POST { "bugKey": "checkout-missing-price" }
 */
import { normalizeSentryWebhook, syntheticSentryEvent } from "@/lib/adapters/sentry";
import { ingestError } from "@/lib/ingest";
import { drainJobs, shouldDrainInline } from "@/lib/orchestrator/runner";
import { getBugByKey, SEEDED_BUGS } from "@/lib/sim/bugs";
import { hydrateSettings, isLiveRuntime } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
 await hydrateSettings();
 if (isLiveRuntime()) {
 return Response.json({ error: "sim fire is disabled in live mode" }, { status: 403 });
 }
 const body = (await req.json().catch(() => ({}))) as { bugKey?: string };
 const bug = getBugByKey(body.bugKey ?? "checkout-missing-price");
 if (!bug) {
 return Response.json(
 { error: "unknown bugKey", options: SEEDED_BUGS.map((b) => b.key) },
 { status: 400 });
 }
 const result = await ingestError(normalizeSentryWebhook(syntheticSentryEvent(bug)));
 // On Vercel the read-only filesystem can't prepare a workspace; enqueue only and
 // let the always-on worker drain it (matching ingest + approve). Draining inline
 // here also raced the worker, splitting the pipeline across two hosts.
 if (shouldDrainInline()) await drainJobs("sim-fire");
 return Response.json(result, { status: 201 });
}

export async function GET() {
 return Response.json({
 bugs: SEEDED_BUGS.map((b) => ({ key: b.key, title: b.title })),
 });
}
