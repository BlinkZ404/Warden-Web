import { readOnlyQuery } from "@/lib/db/client";
import { config, live } from "@/lib/config";
import { extractJson, anthropicText } from "@/lib/agents/json";
import { getBugByFingerprint } from "@/lib/sim/bugs";
import type { Incident } from "@/lib/db/types";
import type { Investigator, InvestigationResult, SentryContext } from "@/lib/agents/types";

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

const liveInvestigator: Investigator = {
  name: "claude",
  async investigate(incident, sentry): Promise<InvestigationResult> {
    // Live path: pull issue context via Sentry MCP + ask Claude for a root cause.
    // (Untested without keys; gated behind live.fixer().)
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
        messages: [
          {
            role: "user",
            content: `You are diagnosing a production error. Respond ONLY with JSON {"rootCause": string, "confidence": number 0..1, "culpritFile": string}.\n\nTitle: ${incident.title}\nError: ${sentry.errorType}: ${sentry.errorMessage}\nService: ${incident.service}`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const parsed = extractJson<{
      rootCause: string;
      confidence: number;
      culpritFile?: string;
    }>(anthropicText(await res.json()));
    return {
      rootCause: parsed.rootCause,
      confidence: parsed.confidence,
      context: { ...ctx, culpritFile: parsed.culpritFile, errorType: sentry.errorType },
    };
  },
};

export function getInvestigator(): Investigator {
  return live.fixer() ? liveInvestigator : simInvestigator;
}
