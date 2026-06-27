/**
 * Dismiss a live incident (operator action). Bulk-clearing is disabled in live
 * mode by design (real incidents shouldn't be wiped en masse), but a human can
 * close an individual one: the state machine allows the active/escalated states
 * to move to `dismissed`, which also frees its fingerprint for a fresh recurrence.
 */
import { transition, canTransition } from "@/lib/statemachine";
import { getIncident } from "@/lib/repo/incidents";
import { checkApiSecret } from "@/lib/auth/api-auth";
import { sessionActor } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await sessionActor();
  if (!actor) {
    const denied = checkApiSecret(req);
    if (denied) return denied;
  }
  const { id } = await params;
  const incident = await getIncident(id);
  if (!incident) return Response.json({ error: "incident not found" }, { status: 404 });
  if (incident.status === "dismissed") return Response.json({ status: "dismissed" });
  if (!canTransition(incident.status, "dismissed")) {
    return Response.json(
      { error: `can't dismiss an incident in '${incident.status}'` },
      { status: 409 },
    );
  }
  await transition(id, "dismissed", actor ?? "founder", { reason: "dismissed by operator" });
  return Response.json({ status: "dismissed" });
}
