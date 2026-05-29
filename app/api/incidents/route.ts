import { listIncidentRows } from "@/lib/view";
import { listScorecards } from "@/lib/repo/scorecard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [incidents, scorecards] = await Promise.all([
    listIncidentRows(200),
    listScorecards(),
  ]);
  return Response.json({ incidents, scorecards });
}
