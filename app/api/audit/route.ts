import { listAuditFeed } from "@/lib/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
 // A present-but-empty `?limit=` parses to 0, so treat any non-positive or
 // non-numeric value as "use the default" rather than collapsing to LIMIT 1.
 const raw = new URL(req.url).searchParams.get("limit");
 const n = raw ? Number(raw) : NaN;
 const safe = Number.isFinite(n) && n > 0 ? Math.min(n, 500) : 200;
 return Response.json({ events: await listAuditFeed(safe) });
}
