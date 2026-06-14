import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDatabase } from "./util";
import { setSettings } from "@/lib/repo/settings";
import { hydrateSettings } from "@/lib/runtime-config";
import {
 signState,
 verifyState,
 buildAuthorizeUrl,
 getOAuthProvider,
 hasStateSecret,
 OAUTH_PROVIDERS,
} from "@/lib/oauth";

describe("oauth", () => {
 beforeEach(async () => {
 await resetDatabase();
 await setSettings({ OAUTH_STATE_SECRET: "test-oauth-secret" });
 await hydrateSettings();
 });
 afterAll(async () => {
 await resetDatabase();
 await hydrateSettings();
 });

 it("signs and verifies a state token; rejects tampering + wrong provider", () => {
 const ts = 1_700_000_000_000;
 const state = signState("github", "nonce123", ts);
 const ok = verifyState(state, "github");
 expect(ok.valid).toBe(true);
 expect(ok.ts).toBe(ts);
 expect(verifyState(state, "vercel").valid).toBe(false); // provider mismatch
 expect(verifyState(state.slice(0, -2) + "xx", "github").valid).toBe(false); // tampered sig
 expect(verifyState("a.b.c", "github").valid).toBe(false); // malformed
 });

 it("a state signed with a different secret does not verify", async () => {
 const state = signState("vercel", "n", 1_700_000_000_000);
 await setSettings({ OAUTH_STATE_SECRET: "rotated-secret" });
 await hydrateSettings();
 expect(verifyState(state, "vercel").valid).toBe(false);
 });

 it("builds the authorize URL with the right params", () => {
 const p = getOAuthProvider("github")!;
 const url = new URL(buildAuthorizeUrl(p, "client-123", "https://app/cb", "state-xyz"));
 expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
 expect(url.searchParams.get("client_id")).toBe("client-123");
 expect(url.searchParams.get("redirect_uri")).toBe("https://app/cb");
 expect(url.searchParams.get("response_type")).toBe("code");
 expect(url.searchParams.get("scope")).toBe("repo");
 expect(url.searchParams.get("state")).toBe("state-xyz");
 });

 it("fails closed when no signing secret is configured", async () => {
 const state = signState("github", "n", 1_700_000_000_000);
 await setSettings({ OAUTH_STATE_SECRET: "" });
 await hydrateSettings();
 expect(hasStateSecret()).toBe(false);
 // A token that was validly signed no longer verifies once the key is gone,
 // and an unconfigured deploy can never mint a forgeable one.
 expect(verifyState(state, "github").valid).toBe(false);
 });

 it("registry covers the OAuth providers with distinct token keys", () => {
 expect(Object.keys(OAUTH_PROVIDERS).sort()).toEqual(["github", "vercel"]);
 expect(getOAuthProvider("github")!.tokenKey).toBe("GITHUB_TOKEN");
 expect(getOAuthProvider("nope")).toBeNull();
 });
});
