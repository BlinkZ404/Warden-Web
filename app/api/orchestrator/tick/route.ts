/**
 * Orchestrator tick; drains the job queue once. A scheduler (Vercel Cron via
 * vercel.json, or any external cron / always-on worker) hits this to advance
 * backed-off / retried jobs; the worker script (npm run worker) does the same
 * loop locally. Vercel Cron invokes the path with a GET and an
 * `Authorization: Bearer <CRON_SECRET>` header, which checkApiSecret accepts.
 */
import { drainJobs } from "@/lib/orchestrator/runner";
import { checkApiSecret } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A live drain can run LLM + git + tests; give it the full function budget.
export const maxDuration = 300;

async function handle(req: Request): Promise<Response> {
 const denied = checkApiSecret(req);
 if (denied) return denied;
 const result = await drainJobs("tick");
 return Response.json(result);
}

// GET for Vercel Cron; POST for manual / worker callers. Both drain once.
export const GET = handle;
export const POST = handle;
