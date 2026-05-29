/**
 * Simulation trigger: fire a seeded bug as if Sentry caught it, then run the
 * pipeline. Powers the dashboard's "Trigger a demo incident" button.
 *
 *   POST { "bugKey": "checkout-missing-price" }
 */
import { normalizeSentryWebhook, syntheticSentryEvent } from "@/lib/adapters/sentry";
import { ingestError } from "@/lib/ingest";
import { drainJobs } from "@/lib/orchestrator/runner";
import { getBugByKey, SEEDED_BUGS } from "@/lib/sim/bugs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { bugKey?: string };
  const bug = getBugByKey(body.bugKey ?? "checkout-missing-price");
  if (!bug) {
    return Response.json(
      { error: "unknown bugKey", options: SEEDED_BUGS.map((b) => b.key) },
      { status: 400 },
    );
  }
  const result = await ingestError(normalizeSentryWebhook(syntheticSentryEvent(bug)));
  await drainJobs("sim-fire");
  return Response.json(result, { status: 201 });
}

export async function GET() {
  return Response.json({
    bugs: SEEDED_BUGS.map((b) => ({ key: b.key, title: b.title })),
  });
}
