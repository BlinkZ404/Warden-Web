/**
 * OAuth start: redirect the founder to the provider's consent screen with a
 * signed CSRF state. If the platform OAuth app isn't configured (no client id),
 * bounce back to the keys page so the manual-paste fallback is still usable.
 */
import { hydrateSettings, setting } from "@/lib/runtime-config";
import {
 getOAuthProvider,
 signState,
 newNonce,
 buildAuthorizeUrl,
 oauthBase,
 callbackRedirectUri,
 hasStateSecret,
} from "@/lib/auth/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
 const { provider } = await params;
 await hydrateSettings();

 const base = oauthBase(req);
 const back = (q: string) => Response.redirect(`${base}/dashboard/keys?${q}`, 302);

 const p = getOAuthProvider(provider);
 if (!p) return back(`oauth=${provider}&status=unknown`);

 const clientId = setting(p.clientIdKey);
 if (!clientId) return back(`oauth=${provider}&status=not_configured`);

 // Refuse to mint a state token we can't verify on the way back.
 if (!hasStateSecret()) return back(`oauth=${provider}&status=not_configured`);

 const state = signState(provider, newNonce(), Date.now());
 return Response.redirect(
 buildAuthorizeUrl(p, clientId, callbackRedirectUri(base, provider), state),
 302);
}
