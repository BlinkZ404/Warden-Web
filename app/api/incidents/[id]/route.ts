import { getIncidentBundle } from "@/lib/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const bundle = await getIncidentBundle(id);
  if (!bundle) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(bundle);
}
