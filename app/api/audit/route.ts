import { listAuditFeed } from "@/lib/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
 const sp = new URL(req.url).searchParams;
 // A missing/empty/non-numeric value yields NaN or 0, so fall back to the
 // default rather than collapsing the page to nothing.
 const ln = Number(sp.get("limit"));
 const limit = Number.isFinite(ln) && ln > 0 ? Math.min(Math.floor(ln), 200) : 50;
 const on = Number(sp.get("offset"));
 const offset = Number.isFinite(on) && on > 0 ? Math.floor(on) : 0;
 const type = sp.get("type")?.trim() || undefined;
 const actor = sp.get("actor")?.trim() || undefined;
 const q = sp.get("q")?.trim() || undefined;
 const page = await listAuditFeed({ limit, offset, type, actor, q });
 return Response.json({
 events: page.rows,
 total: page.total,
 types: page.types,
 actors: page.actors,
 });
}
