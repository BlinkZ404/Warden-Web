/**
 * Pluggable trigger sources (PLAN §3 "vendor-neutral", §11 stubbed, §12).
 *
 * An incident can originate from anything that observes production, not just
 * Sentry. Every source normalizes its payload into the same `NormalizedError`
 * and hands it to ingestError, so the orchestrator never knows or cares where
 * an incident came from.
 *
 * Sentry is fully wired (lib/adapters/sentry.ts + the webhook route). The three
 * below are clean, working seams that are intentionally NOT wired to routes in
 * v1; they show how a new source plugs in without touching the pipeline.
 */
import { createHash } from "node:crypto";
import type { NormalizedError } from "@/lib/adapters/sentry";

export interface TriggerSource<TPayload = unknown> {
  name: string;
  /** Map a source-specific payload into the canonical incident shape. */
  parse(payload: TPayload): NormalizedError;
}

function fingerprint(...parts: string[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

const now = () => new Date();

/** CI failure (e.g. a GitHub Actions job that started failing). */
export const ciFailureSource: TriggerSource<{
  workflow: string;
  job: string;
  failingStep: string;
  service?: string;
  logExcerpt?: string;
}> = {
  name: "ci",
  parse(p) {
    return {
      source: "ci",
      externalId: `ci:${p.workflow}/${p.job}`,
      fingerprint: `ci/${p.workflow}/${p.job}/${fingerprint(p.failingStep)}`,
      title: `CI failing: ${p.job} → ${p.failingStep}`,
      service: p.service ?? p.workflow,
      severity: "error",
      errorType: "CIFailure",
      errorMessage: p.logExcerpt ?? p.failingStep,
      firstSeen: now(),
      lastSeen: now(),
      raw: p as Record<string, unknown>,
    };
  },
};

/** Uptime / health-check monitor (e.g. an endpoint returning 5xx). */
export const uptimeMonitorSource: TriggerSource<{
  endpoint: string;
  statusCode: number;
  service?: string;
}> = {
  name: "uptime",
  parse(p) {
    return {
      source: "uptime",
      externalId: `uptime:${p.endpoint}`,
      fingerprint: `uptime/${p.endpoint}/${p.statusCode}`,
      title: `${p.endpoint} returning ${p.statusCode}`,
      service: p.service ?? new URL(p.endpoint).host,
      severity: p.statusCode >= 500 ? "error" : "warning",
      errorType: "UptimeFailure",
      errorMessage: `HTTP ${p.statusCode} from ${p.endpoint}`,
      firstSeen: now(),
      lastSeen: now(),
      raw: p as Record<string, unknown>,
    };
  },
};

/** Direct user report (e.g. "checkout is broken" from a support widget). */
export const userReportSource: TriggerSource<{
  message: string;
  url?: string;
  service?: string;
}> = {
  name: "user-report",
  parse(p) {
    return {
      source: "user-report",
      externalId: `report:${fingerprint(p.message)}`,
      fingerprint: `user-report/${fingerprint(p.message, p.url ?? "")}`,
      title: `User report: ${p.message.slice(0, 80)}`,
      service: p.service ?? "unknown",
      severity: "warning",
      errorType: "UserReport",
      errorMessage: p.message,
      firstSeen: now(),
      lastSeen: now(),
      raw: p as Record<string, unknown>,
    };
  },
};

export const SOURCES = {
  ci: ciFailureSource,
  uptime: uptimeMonitorSource,
  "user-report": userReportSource,
};
