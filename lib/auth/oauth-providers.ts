/**
 * OAuth provider metadata (client-safe, no server deps). Split out from
 * lib/oauth.ts so the keys page can render connect rows straight from the
 * registry; a new provider is added in exactly one place.
 */

export interface OAuthProvider {
 id: string;
 label: string;
 actor: string; // brand-logo key
 authorizeUrl: string;
 tokenUrl: string;
 scopes: string;
 /** Settings key the resulting access token is stored under. */
 tokenKey: string;
 clientIdKey: string;
 clientSecretKey: string;
}

export const OAUTH_PROVIDERS: Record<string, OAuthProvider> = {
 vercel: {
 id: "vercel",
 label: "Vercel",
 actor: "vercel",
 authorizeUrl: "https://vercel.com/oauth/authorize",
 tokenUrl: "https://api.vercel.com/v2/oauth/access_token",
 scopes: "",
 tokenKey: "VERCEL_TOKEN",
 clientIdKey: "VERCEL_OAUTH_CLIENT_ID",
 clientSecretKey: "VERCEL_OAUTH_CLIENT_SECRET",
 },
 github: {
 id: "github",
 label: "GitHub",
 actor: "github",
 authorizeUrl: "https://github.com/login/oauth/authorize",
 tokenUrl: "https://github.com/login/oauth/access_token",
 scopes: "repo",
 tokenKey: "GITHUB_TOKEN",
 clientIdKey: "GITHUB_OAUTH_CLIENT_ID",
 clientSecretKey: "GITHUB_OAUTH_CLIENT_SECRET",
 },
 // Sentry intentionally omitted: ingestion needs the webhook SIGNING secret
 // (SENTRY_CLIENT_SECRET, entered manually), not an OAuth access token; an
 // OAuth "connect" would store a token nothing reads and mislead the operator.
};

export function getOAuthProvider(id: string): OAuthProvider | null {
 return OAUTH_PROVIDERS[id] ?? null;
}
