import { listScorecards } from "@/lib/repo/scorecard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ scorecards: await listScorecards() });
}
