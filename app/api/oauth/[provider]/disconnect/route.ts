/** Disconnect: clear the stored access token for a provider. */
import { getOAuthProvider } from "@/lib/oauth";
import { setSettings } from "@/lib/repo/settings";
import { checkApiSecret } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
 const denied = checkApiSecret(req);
 if (denied) return denied;
 const { provider } = await params;
 const p = getOAuthProvider(provider);
 if (!p) return Response.json({ error: "unknown provider" }, { status: 404 });
 await setSettings({ [p.tokenKey]: "" });
 return Response.json({ ok: true });
}
