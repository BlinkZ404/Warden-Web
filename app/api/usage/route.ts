import { computeUsage } from "@/lib/repo/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
 return Response.json({ usage: await computeUsage() });
}
