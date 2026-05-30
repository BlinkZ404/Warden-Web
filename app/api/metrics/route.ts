import { computeMetrics } from "@/lib/repo/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ metrics: await computeMetrics() });
}
