/**
 * The human gate endpoint (PLAN §5.1, M8). A decision here writes a real
 * `approvals` row; the orchestrator's check reads that row regardless of who
 * wrote it. On approval we resume the pipeline inline so the fix ships in one
 * tap.
 */
import { recordApproval, ApprovalStateError } from "@/lib/approval";
import { drainJobs } from "@/lib/orchestrator/runner";
import { getIncident } from "@/lib/repo/incidents";
import { checkApiSecret } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
 req: Request,
 { params }: { params: Promise<{ id: string }> }) {
 const denied = checkApiSecret(req);
 if (denied) return denied;
 const { id } = await params;
 const body = (await req.json().catch(() => ({}))) as {
 decision?: "approve" | "reject";
 decidedBy?: string;
 channel?: string;
 };
 if (body.decision !== "approve" && body.decision !== "reject") {
 return Response.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 });
 }

 try {
 await recordApproval({
 incidentId: id,
 decision: body.decision,
 decidedBy: body.decidedBy ?? "founder",
 channel: body.channel ?? "web",
 });
 } catch (e) {
 if (e instanceof ApprovalStateError) {
 return Response.json({ error: e.message }, { status: 409 });
 }
 throw e;
 }

 await drainJobs("approve");
 const incident = await getIncident(id);
 return Response.json({ status: incident?.status });
}
