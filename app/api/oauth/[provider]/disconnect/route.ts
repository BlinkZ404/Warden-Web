/** Disconnect: clear the stored access token for a provider. */
import { getOAuthProvider } from "@/lib/oauth";
import { setSettings } from "@/lib/repo/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
 const { provider } = await params;
 const p = getOAuthProvider(provider);
 if (!p) return Response.json({ error: "unknown provider" }, { status: 404 });
 await setSettings({ [p.tokenKey]: "" });
 return Response.json({ ok: true });
}
