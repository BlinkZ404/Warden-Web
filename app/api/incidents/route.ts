import { listIncidentRows } from "@/lib/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
 // Scorecard/metrics now come from /api/metrics; this route is just incidents.
 return Response.json({ incidents: await listIncidentRows(200) });
}
