/**
 * One-tap revert endpoint (PLAN §2, §13). A founder reverting a shipped fix.
 * Reuses the same Vercel instant-rollback adapter as the automatic path.
 */
import { recordRevert, RevertStateError } from "@/lib/revert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { decidedBy?: string };
  try {
    const result = await recordRevert(id, body.decidedBy ?? "founder");
    return Response.json(result);
  } catch (e) {
    if (e instanceof RevertStateError) {
      return Response.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }
}
