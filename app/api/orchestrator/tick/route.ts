/**
 * Orchestrator tick — drains the job queue once. Wire a Vercel Cron (or any
 * scheduler) to POST this every minute in production; the worker script
 * (npm run worker) does the same loop locally.
 */
import { drainJobs } from "@/lib/orchestrator/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await drainJobs("tick");
  return Response.json(result);
}
