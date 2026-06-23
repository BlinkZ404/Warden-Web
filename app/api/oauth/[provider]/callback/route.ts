/**
 * OAuth callback: verify the signed state, exchange the code for an access token,
 * store it under the provider's settings key (masked like every other secret),
 * and return the founder to the keys page with a status flag.
 */
import { hydrateSettings, setting } from "@/lib/runtime-config";
import { setSettings } from "@/lib/repo/settings";
import {
 getOAuthProvider,
 verifyState,
 exchangeCode,
 oauthBase,
 callbackRedirectUri,
} from "@/lib/auth/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_TTL_MS = 10 * 60 * 1000;

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
 const { provider } = await params;
 await hydrateSettings();

 const base = oauthBase(req);
 const back = (status: string) =>
 Response.redirect(`${base}/dashboard/keys?oauth=${provider}&status=${status}`, 302);

 const p = getOAuthProvider(provider);
 if (!p) return back("unknown");

 const url = new URL(req.url);
 const code = url.searchParams.get("code");
 const state = url.searchParams.get("state");
 if (!code || !state) return back("denied");

 const check = verifyState(state, provider);
 if (!check.valid || Date.now() - check.ts > STATE_TTL_MS) return back("state");

 const clientId = setting(p.clientIdKey);
 const clientSecret = setting(p.clientSecretKey);
 if (!clientId || !clientSecret) return back("not_configured");

 let token: string | null = null;
 try {
 token = await exchangeCode(p, code, clientId, clientSecret, callbackRedirectUri(base, provider));
 } catch {
 return back("error");
 }
 if (!token) return back("denied");

 await setSettings({ [p.tokenKey]: token });
 return back("connected");
}
