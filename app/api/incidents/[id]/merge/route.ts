/**
 * Merge a delivered fix's open PR (operator action). Reuses the linked repo's
 * GitHub token and the PR number recorded on the deploy event; the team's CI/CD
 * then ships it. Guest Mode is allowed (checkOperator does not fail closed).
 */
import { getIncident } from "@/lib/repo/incidents";
import { listEvents } from "@/lib/repo/events";
import { checkOperator } from "@/lib/auth/api-auth";
import { sessionActor } from "@/lib/auth/session";
import { mergePr } from "@/lib/adapters/github-deliver";
import { hydrateSettings } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await sessionActor();
  if (!actor) {
    const denied = checkOperator(req);
    if (denied) return denied;
  }
  const { id } = await params;
  await hydrateSettings();
  const incident = await getIncident(id);
  if (!incident) return Response.json({ error: "incident not found" }, { status: 404 });

  const events = await listEvents(id);
  const deploy = events.find(
    (e) => e.type === "deploy" && !!(e.payload as { delivered?: boolean }).delivered,
  );
  const prNumber = (deploy?.payload as { prNumber?: number } | undefined)?.prNumber;
  if (!prNumber) return Response.json({ error: "no open PR to merge" }, { status: 400 });

  try {
    return Response.json(await mergePr(prNumber));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "merge failed" },
      { status: 502 },
    );
  }
}
