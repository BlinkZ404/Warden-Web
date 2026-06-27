/**
 * Runtime configuration overlay.
 *
 * `lib/config.ts` resolves everything from the ambient environment once at module
 * import; fine for deploy targets where env is the source of truth, but it means
 * values saved through the dashboard (run mode, provider keys, role→model
 * assignments, Sentry/Vercel secrets) never reach the pipeline.
 *
 * This module closes that gap. `hydrateSettings()` pulls the saved `settings`
 * table into a process-level overlay at the start of each run; every resolver
 * below then reads DB-first, falling back to `process.env`. The reads are
 * synchronous so the agent factories and adapters stay sync; only the run entry
 * points (the job drain and the Sentry webhook) await the one hydration call.
 */
import { allSettings } from "@/lib/repo/settings";
import { MODEL_PROVIDERS, parseAssignment } from "@/lib/models";
import type { CompatProvider } from "@/lib/agents/openai-compat";
import { DEFAULT_DENY_GLOBS, type ScopePolicy } from "@/lib/policy/gate";

let overlay: Record<string, string> = {};

/** Pull the saved settings into the overlay. Best-effort: a failed read keeps the
 * last good overlay so a transient DB hiccup never blocks a run. */
export async function hydrateSettings(): Promise<void> {
 try {
 overlay = await allSettings();
 } catch {
 /* keep the last good overlay (or the empty default) */
 }
}

/** A saved value, DB-first then the ambient environment, trimmed. */
export function setting(key: string, fallback = ""): string {
 const v = overlay[key];
 if (v != null && v.trim() !== "") return v.trim();
 return process.env[key]?.trim() || fallback;
}

export type Mode = "simulation" | "live";

export function effectiveMode(): Mode {
 return setting("WARDEN_MODE", "simulation") === "live" ? "live" : "simulation";
}

export function isLiveRuntime(): boolean {
 return effectiveMode() === "live";
}

/** Identity for the fix commit. Defaults to a bot, but set GIT_AUTHOR_EMAIL to a
 *  real GitHub-account email so a delivered PR's Vercel (and similar) checks
 *  recognize the commit author instead of refusing to build it. */
export function gitAuthor(): { email: string; name: string } {
 return {
 email: setting("GIT_AUTHOR_EMAIL", "ci@warden.dev"),
 name: setting("GIT_AUTHOR_NAME", "Warden"),
 };
}

/**
 * Resolve a role's `"<providerId>::<modelId>"` assignment plus that provider's
 * saved API key into an OpenAI-compatible provider. Returns null when the role
 * is unassigned, the value is legacy/bare (no `::`), the provider is unknown, or
 * its key is missing; the caller then falls back to env config or simulation.
 */
export function assignedProvider(roleKey: string): CompatProvider | null {
 const a = parseAssignment(setting(roleKey));
 if (!a || !a.id) return null;
 const provider = MODEL_PROVIDERS.find((p) => p.id === a.pid);
 if (!provider?.baseUrl) return null;
 const apiKey = setting(provider.keyName);
 if (!apiKey) return null;
 return { baseUrl: provider.baseUrl, apiKey, model: a.id };
}

/** The model id assigned to a role (e.g. "openai/gpt-5.5"), for display attribution. */
export function assignedModelId(roleKey: string): string | null {
 return parseAssignment(setting(roleKey))?.id ?? null;
}

/** The reviewer panel from the saved REVIEWER_1/2/3 assignments (configured only). */
export function assignedReviewers(): CompatProvider[] {
 return [1, 2, 3]
 .map((n) => assignedProvider(`REVIEWER_${n}_MODEL`))
 .filter((p): p is CompatProvider => p != null);
}

function intIn(raw: string, def: number, min: number, max: number): number {
 const v = parseInt(raw, 10);
 return Number.isNaN(v) ? def : Math.max(min, Math.min(max, v));
}

export function panelSize(): number {
 return intIn(setting("REVIEW_PANEL_SIZE", "1"), 1, 1, 3);
}

export function approvalsRequired(): number | null {
 const raw = setting("REVIEW_APPROVALS_REQUIRED");
 return raw ? intIn(raw, 1, 1, 3) : null;
}

/**
 * Autopilot: when on, a fix that passes the verification gate ships without
 * waiting for a human tap. Guardrail/scope violations and reviewer disagreement
 * still escalate earlier, so this only auto-approves fixes that already cleared
 * verification; reversibility + auto-rollback remain the safety net.
 */
export function autoApprove(): boolean {
 return setting("AUTO_APPROVE") === "true";
}

export type DeliveryMode = "preview" | "pr" | "merge";

/**
 * How an approved, verified fix is delivered:
 *  - "preview": Warden promotes its own Vercel deploy (the original path).
 *  - "pr":      Warden pushes the fix branch and opens a PR on the linked repo;
 *               the team reviews/merges and their CI/CD deploys.
 *  - "merge":   Warden merges the verified fix straight to the base branch so the
 *               team's CI/CD ships it immediately ("fix ASAP").
 * Defaults to "pr" once a GitHub repo is linked, else "preview".
 */
export function deliveryMode(): DeliveryMode {
 const m = setting("DELIVERY_MODE");
 if (m === "preview" || m === "pr" || m === "merge") return m;
 return setting("TARGET_REPO_URL").trim() ? "pr" : "preview";
}

/**
 * How to boot the linked app for request-replay reproduction (operator-set, so
 * Warden can run an arbitrary repo). All optional: install defaults to npm
 * ci/install, build is skipped when empty, and command falls back to the repo's
 * package.json `start` then `node server.js`.
 */
export function bootConfig(): { command?: string; build?: string; install?: string } {
 const command = setting("RUN_COMMAND");
 const build = setting("BUILD_COMMAND");
 const install = setting("INSTALL_COMMAND");
 return {
 ...(command ? { command } : {}),
 ...(build ? { build } : {}),
 ...(install ? { install } : {}),
 };
}

export interface VercelConfig {
 token: string;
 projectId: string;
 teamId: string;
 repoId: string;
}

export function vercelConfig(): VercelConfig {
 return {
 token: setting("VERCEL_TOKEN"),
 projectId: setting("VERCEL_PROJECT_ID"),
 teamId: setting("VERCEL_TEAM_ID"),
 repoId: setting("VERCEL_REPO_ID"),
 };
}

/** Per-capability "running for real?" gates, resolved against the overlay. */
export const liveCap = {
 deploy: () => isLiveRuntime() && !!setting("VERCEL_TOKEN"),
 sentry: () => isLiveRuntime() && !!setting("SENTRY_CLIENT_SECRET"),
};

export function sentryClientSecret(): string {
 return setting("SENTRY_CLIENT_SECRET");
}

/**
 * The per-tenant blast-radius policy (file/churn limits + protected-path globs).
 * `DEFAULT_DENY_GLOBS` is always on; operator-configured globs are merged on top
 * so an operator can only ever widen the protected set, never expose the floor.
 */
export function scopePolicy(): ScopePolicy {
 const operatorGlobs = setting("POLICY_DENY_GLOBS")
  .split(/[\n,]/)
  .map((s) => s.trim())
  .filter(Boolean);
 return {
 maxFiles: intIn(setting("POLICY_MAX_FILES", "5"), 5, 1, 1000),
 maxChurn: intIn(setting("POLICY_MAX_CHURN", "120"), 120, 1, 1_000_000),
 denyGlobs: Array.from(new Set([...DEFAULT_DENY_GLOBS, ...operatorGlobs])),
 };
}
