/**
 * Central configuration + run-mode resolution.
 *
 * Nightshift runs in one of two modes:
 *
 *  - `simulation` (default): external SaaS that needs accounts/keys is simulated
 *    — Sentry as an error source, Vercel as a host, push-notification delivery,
 *    and the LLM agents' reasoning. Everything runs offline.
 *
 *  - `live`: real adapters are used wherever the matching secret is present.
 *
 * The deterministic verification gate (running the target app's tests and
 * confirming the original error stops) is REAL in BOTH modes — it is the safety
 * gate and must never be faked (PLAN §5.3).
 */

// Node 20+/24 can load a dotenv file natively. Safe to call repeatedly; ignore
// if the file is missing (e.g. on Vercel where env comes from the platform).
try {
  if (typeof process.loadEnvFile === "function") process.loadEnvFile(".env");
} catch {
  /* no .env file — rely on the ambient environment */
}

export type Mode = "simulation" | "live";

function str(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

const mode: Mode = str("NIGHTSHIFT_MODE", "simulation") === "live" ? "live" : "simulation";

// OpenAI-compatible agent providers (DeepSeek, GLM, OpenAI, Ollama, …). AGENT_*
// is the default for every agent; FIXER_*/REVIEWER_*/INVESTIGATOR_* override it
// (e.g. run the Fixer and Reviewer on different providers for the cross-check).
const agentDefault = {
  baseUrl: str("AGENT_BASE_URL"),
  apiKey: str("AGENT_API_KEY"),
  model: str("AGENT_MODEL"),
};
const agentProvider = (prefix: string) => ({
  baseUrl: str(`${prefix}_BASE_URL`, agentDefault.baseUrl),
  apiKey: str(`${prefix}_API_KEY`, agentDefault.apiKey),
  model: str(`${prefix}_MODEL`, agentDefault.model),
});

function intIn(name: string, def: number, min: number, max: number): number {
  const v = parseInt(str(name, String(def)), 10);
  return Number.isNaN(v) ? def : Math.max(min, Math.min(max, v));
}

// Explicit reviewer panel (1–3). Unlike the providers above, these do NOT fall
// back to AGENT_* — each is an opt-in slot, so you can run the cross-check on
// different model families (REVIEWER_1=GLM, REVIEWER_2=DeepSeek, …).
const reviewerPanel = [1, 2, 3].map((n) => ({
  baseUrl: str(`REVIEWER_${n}_BASE_URL`),
  apiKey: str(`REVIEWER_${n}_API_KEY`),
  model: str(`REVIEWER_${n}_MODEL`),
}));

export const config = {
  mode,
  isSimulation: mode === "simulation",
  isLive: mode === "live",

  databaseUrl: str(
    "DATABASE_URL",
    "postgres://nightshift:nightshift@localhost:5433/nightshift",
  ),

  targetRepoPath: str("TARGET_REPO_PATH", "./sample-app"),

  agents: {
    anthropicApiKey: str("ANTHROPIC_API_KEY"),
    anthropicModel: str("ANTHROPIC_MODEL", "claude-opus-4-8"),
    openaiApiKey: str("OPENAI_API_KEY"),
    // A chat-completions-compatible model. Codex models (gpt-5-codex) only work
    // on /v1/responses and 400 on /v1/chat/completions — see GO-LIVE.md.
    openaiModel: str("OPENAI_MODEL", "gpt-4.1"),
    embeddingApiKey: str("EMBEDDING_API_KEY"),
    // OpenAI-compatible providers (preferred when set) — DeepSeek, GLM, etc.
    fixer: agentProvider("FIXER"),
    reviewer: agentProvider("REVIEWER"),
    investigator: agentProvider("INVESTIGATOR"),
    reviewers: reviewerPanel, // explicit 1–3 reviewer panel
  },

  // Reviewer panel (PLAN §5.4 multi-agent cross-check): 1 Fixer + 1–3 Reviewers.
  review: {
    // When no explicit REVIEWER_1/2/3 panel is set, replicate the default
    // reviewer provider this many times (1–3).
    panelSize: intIn("REVIEW_PANEL_SIZE", 1, 1, 3),
    // How many reviewers must APPROVE to proceed. Blank = unanimous (all of them).
    approvalsRequired: str("REVIEW_APPROVALS_REQUIRED")
      ? intIn("REVIEW_APPROVALS_REQUIRED", 1, 1, 3)
      : null,
  },

  sentry: {
    clientSecret: str("SENTRY_CLIENT_SECRET"),
  },

  vercel: {
    token: str("VERCEL_TOKEN"),
    projectId: str("VERCEL_PROJECT_ID"),
    teamId: str("VERCEL_TEAM_ID"),
    repoId: str("VERCEL_REPO_ID"), // git-linked project repo id (for deploy parity)
  },

  push: {
    publicKey: str("VAPID_PUBLIC_KEY"),
    privateKey: str("VAPID_PRIVATE_KEY"),
    subject: str("VAPID_SUBJECT", "mailto:founder@example.com"),
  },
} as const;

/**
 * Per-capability "is this running for real?" checks.
 *
 * `live` mode degrades gracefully to simulation for any capability whose secret
 * is missing, so a half-configured environment still runs end-to-end instead of
 * crashing. Each adapter calls the matching helper to pick its implementation.
 */
export const live = {
  fixer: () => config.isLive && !!config.agents.anthropicApiKey,
  reviewer: () => config.isLive && !!config.agents.openaiApiKey,
  embeddings: () => config.isLive && !!config.agents.embeddingApiKey,
  sentry: () => config.isLive && !!config.sentry.clientSecret,
  deploy: () => config.isLive && !!config.vercel.token,
  push: () => config.isLive && !!config.push.privateKey,
};

export type AppConfig = typeof config;
