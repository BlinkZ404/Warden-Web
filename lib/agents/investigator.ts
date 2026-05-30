import { readOnlyQuery } from "@/lib/db/client";
import { config } from "@/lib/config";
import { extractJson, anthropicText } from "@/lib/agents/json";
import { chatJson, isConfigured } from "@/lib/agents/openai-compat";
import { httpError } from "@/lib/http";
import { getBugByFingerprint } from "@/lib/sim/bugs";
import type { Incident } from "@/lib/db/types";
import type { Investigator, InvestigationResult, SentryContext } from "@/lib/agents/types";

const INV_SYSTEM =
  'You diagnose a production error. Respond ONLY with a JSON object {"rootCause": string, "confidence": number between 0 and 1, "culpritFile": string (repo-relative path)}.';

function invUser(incident: Incident, sentry: SentryContext): string {
  const culprit = sentry.culpritFile ? `\nSentry culprit file: ${sentry.culpritFile}` : "";
  return `Title: ${incident.title}\nError: ${sentry.errorType}: ${sentry.errorMessage}\nService: ${incident.service}${culprit}`;
}

// The investigator shares the Fixer's provider unless its own is configured.
function investigatorProvider() {
  return isConfigured(config.agents.investigator)
    ? config.agents.investigator
    : config.agents.fixer;
}

/**
 * Read-only investigation (PLAN §5.5, §6): the investigator may read the
 * database to gather context but connects with NO write authority. We exercise
 * that here via readOnlyQuery — any write issued in this path would throw.
 */
async function readOnlyContext(incident: Incident): Promise<Record<string, unknown>> {
  const priors = await readOnlyQuery<{ n: number }>(
    `SELECT count(*)::int AS n FROM incidents
     WHERE fingerprint = $1 AND id <> $2 AND status IN ('resolved','rolled_back')`,
    [incident.fingerprint, incident.id],
  );
  return { priorResolvedOccurrences: priors[0]?.n ?? 0, dbRole: "read-only" };
}

const simInvestigator: Investigator = {
  name: "claude",
  async investigate(incident, sentry): Promise<InvestigationResult> {
    const bug = getBugByFingerprint(incident.fingerprint);
    const ctx = await readOnlyContext(incident);
    if (bug) {
      return {
        rootCause: bug.rootCause,
        confidence: 0.9,
        context: {
          ...ctx,
          errorType: bug.errorType,
          errorMessage: bug.errorMessage,
          culpritFile: bug.culpritFile,
          source: "sentry-mcp (simulated)",
        },
      };
    }
    return {
      rootCause: `Unrecognized ${sentry.errorType}: ${sentry.errorMessage}. Needs human triage.`,
      confidence: 0.35,
      context: { ...ctx, errorType: sentry.errorType, errorMessage: sentry.errorMessage },
    };
  },
};

type InvJson = { rootCause: string; confidence: number; culpritFile?: string };

function toResult(
  parsed: InvJson,
  ctx: Record<string, unknown>,
  sentry: SentryContext,
): InvestigationResult {
  return {
    rootCause: parsed.rootCause,
    confidence: parsed.confidence,
    context: { ...ctx, culpritFile: parsed.culpritFile, errorType: sentry.errorType },
  };
}

/** Any OpenAI-compatible provider (DeepSeek, GLM, OpenAI, …) configured via env. */
const compatInvestigator: Investigator = {
  name: "agent",
  async investigate(incident, sentry): Promise<InvestigationResult> {
    const ctx = await readOnlyContext(incident);
    const parsed = await chatJson<InvJson>(
      investigatorProvider(),
      INV_SYSTEM,
      invUser(incident, sentry),
    );
    return toResult(parsed, ctx, sentry);
  },
};

/** Native Anthropic Messages API. (Untested without keys.) */
const liveInvestigator: Investigator = {
  name: "claude",
  async investigate(incident, sentry): Promise<InvestigationResult> {
    const ctx = await readOnlyContext(incident);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.agents.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.agents.anthropicModel,
        max_tokens: 1024,
        messages: [{ role: "user", content: `${INV_SYSTEM}\n\n${invUser(incident, sentry)}` }],
      }),
    });
    if (!res.ok) await httpError("anthropic", res);
    const parsed = extractJson<InvJson>(anthropicText(await res.json()));
    return toResult(parsed, ctx, sentry);
  },
};

export function getInvestigator(): Investigator {
  if (config.isLive && isConfigured(investigatorProvider())) return compatInvestigator;
  if (config.isLive && config.agents.anthropicApiKey) return liveInvestigator;
  return simInvestigator;
}
