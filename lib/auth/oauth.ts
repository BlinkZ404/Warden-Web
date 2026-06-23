/**
 * One-click OAuth (authorization-code flow) for the integrations a founder
 * shouldn't have to hand-paste tokens for.
 *
 * The Warden platform registers one OAuth app per provider (client id/secret in
 * the environment); each founder just clicks "Connect". The start route bounces
 * to the provider with a signed CSRF `state`; the callback verifies it, exchanges
 * the code for an access token, and stores it in the same `settings` table the
 * manual flow uses; so the rest of the runtime is unchanged. Manual paste stays
 * available as a fallback before any OAuth app is registered.
 *
 * State is a stateless signed token (HMAC), so there is no CSRF table to manage.
 */
import { createHmac, randomBytes } from "node:crypto";
import { setting } from "@/lib/runtime-config";
import { safeEqual } from "@/lib/hmac";
import { OAUTH_PROVIDERS, getOAuthProvider, type OAuthProvider } from "@/lib/auth/oauth-providers";

export { OAUTH_PROVIDERS, getOAuthProvider };
export type { OAuthProvider };

/** The app's base URL: an explicit setting, else the request origin. */
export function oauthBase(req: Request): string {
 return setting("APP_BASE_URL") || new URL(req.url).origin;
}

/** The callback redirect URI; one definition shared by start + callback so the
 * registered and exchanged URIs can never drift. */
export function callbackRedirectUri(base: string, provider: string): string {
 return `${base}/api/oauth/${provider}/callback`;
}

/** The HMAC signing key for state tokens. Empty when nothing is configured.
 * There is no public fallback, so an unconfigured deploy can't sign tokens an
 * attacker could forge with a known constant. */
function stateSecret(): string {
 return setting("OAUTH_STATE_SECRET") || setting("AGENT_API_KEY") || "";
}

/** Whether OAuth state signing is configured. The start route refuses to begin
 * a flow without it, so we never mint a forgeable token. */
export function hasStateSecret(): boolean {
 return stateSecret().length > 0;
}

export function newNonce(): string {
 return randomBytes(12).toString("hex");
}

/** A signed `provider.nonce.ts.sig` state token. */
export function signState(provider: string, nonce: string, ts: number): string {
 const body = `${provider}.${nonce}.${ts}`;
 const sig = createHmac("sha256", stateSecret()).update(body).digest("base64url");
 return `${body}.${sig}`;
}

export interface StateCheck {
 valid: boolean;
 ts: number;
}

/** Verify the HMAC + provider match of a state token. Staleness is the caller's job. */
export function verifyState(state: string, provider: string): StateCheck {
 // No signing key configured → nothing can have been validly signed.
 if (!hasStateSecret()) return { valid: false, ts: 0 };
 const parts = state.split(".");
 if (parts.length !== 4) return { valid: false, ts: 0 };
 const [p, nonce, tsStr, sig] = parts;
 const ts = Number(tsStr);
 if (p !== provider || !Number.isFinite(ts)) return { valid: false, ts: 0 };
 const expected = createHmac("sha256", stateSecret())
 .update(`${p}.${nonce}.${ts}`)
 .digest("base64url");
 return { valid: safeEqual(sig, expected), ts };
}

/** Build the provider's authorize URL for the redirect. */
export function buildAuthorizeUrl(
 provider: OAuthProvider,
 clientId: string,
 redirectUri: string,
 state: string): string {
 const u = new URL(provider.authorizeUrl);
 u.searchParams.set("client_id", clientId);
 u.searchParams.set("redirect_uri", redirectUri);
 u.searchParams.set("response_type", "code");
 if (provider.scopes) u.searchParams.set("scope", provider.scopes);
 u.searchParams.set("state", state);
 return u.toString();
}

/** Exchange an authorization code for an access token. Returns null on failure. */
export async function exchangeCode(
 provider: OAuthProvider,
 code: string,
 clientId: string,
 clientSecret: string,
 redirectUri: string): Promise<string | null> {
 const res = await fetch(provider.tokenUrl, {
 method: "POST",
 headers: {
 "content-type": "application/x-www-form-urlencoded",
 accept: "application/json",
 },
 body: new URLSearchParams({
 client_id: clientId,
 client_secret: clientSecret,
 code,
 grant_type: "authorization_code",
 redirect_uri: redirectUri,
 }),
 });
 const j = (await res.json().catch(() => ({}))) as { access_token?: string };
 return j.access_token || null;
}
