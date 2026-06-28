import { query, queryOne } from "@/lib/db/client";
import { MODEL_PROVIDERS, ROLE_SLOTS } from "@/lib/models";

/**
 * Keys whose values are credentials; never returned to the client in full.
 * The provider API keys are derived from the model catalog so a newly added
 * provider is masked by construction; the rest are service secrets.
 */
export const SECRET_KEYS = new Set<string>([
 ...MODEL_PROVIDERS.map((p) => p.keyName),
 "SENTRY_CLIENT_SECRET",
 "VERCEL_TOKEN",
 "GITHUB_TOKEN",
 "SLACK_BOT_TOKEN",
 "SLACK_SIGNING_SECRET",
 // Platform OAuth-app secrets (set in the environment, never displayed).
 "VERCEL_OAUTH_CLIENT_SECRET",
 "GITHUB_OAUTH_CLIENT_SECRET",
 "OAUTH_STATE_SECRET",
]);

/**
 * Keys the dashboard is allowed to write via PUT /api/settings. intentionally
 * excludes env-only PLATFORM secrets (OAuth app client id/secret, the OAuth
 * state-signing key, AGENT_API_KEY, APP_BASE_URL): because the runtime overlay
 * reads the DB before process.env, letting those be written would shadow the
 * platform's env config. The OAuth callback writes its access tokens through
 * `setSettings` directly, so they need not be listed here.
 */
export const WRITABLE_KEYS = new Set<string>([
 ...MODEL_PROVIDERS.map((p) => p.keyName),
 ...ROLE_SLOTS.map((r) => r.key),
 "WARDEN_MODE",
 "BILLING_MODE",
 "AUTO_APPROVE",
 "FIX_MAX_ATTEMPTS",
 "REVIEW_PANEL_SIZE",
 "REVIEW_APPROVALS_REQUIRED",
 "SENTRY_CLIENT_SECRET",
 "VERCEL_TOKEN",
 "VERCEL_PROJECT_ID",
 "VERCEL_TEAM_ID",
 "GITHUB_TOKEN",
 "TARGET_REPO_URL",
 "GIT_AUTHOR_EMAIL",
 "GIT_AUTHOR_NAME",
 "DELIVERY_MODE",
 "INSTALL_COMMAND",
 "BUILD_COMMAND",
 "RUN_COMMAND",
 "SLACK_BOT_TOKEN",
 "SLACK_SIGNING_SECRET",
 "SLACK_CHANNEL",
 "POLICY_MAX_FILES",
 "POLICY_MAX_CHURN",
 "POLICY_DENY_GLOBS",
]);

export async function getSetting(key: string): Promise<string | null> {
 const r = await queryOne<{ value: string | null }>("SELECT value FROM settings WHERE key = $1", [
 key,
 ]);
 return r?.value ?? null;
}

export async function allSettings(): Promise<Record<string, string>> {
 const rows = await query<{ key: string; value: string | null }>("SELECT key, value FROM settings");
 const out: Record<string, string> = {};
 for (const r of rows) if (r.value != null) out[r.key] = r.value;
 return out;
}

export async function setSettings(entries: Record<string, string>): Promise<void> {
 const keys = Object.keys(entries);
 if (keys.length === 0) return;
 await query(
 `INSERT INTO settings (key, value)
 SELECT * FROM unnest($1::text[], $2::text[])
 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
 [keys, keys.map((k) => entries[k])]);
}
