/**
 * Sentry error-source adapter (PLAN §7). A pluggable trigger: live mode parses
 * real Sentry issue webhooks (with HMAC signature verification); simulation mode
 * emits synthetic Sentry-shaped payloads for the seeded bugs, which flow through
 * the SAME normalize path — so ingest code isn't special-cased per mode.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SeededBug } from "@/lib/sim/bugs";

export interface NormalizedError {
  source: "sentry";
  externalId: string;
  fingerprint: string;
  title: string;
  service: string;
  severity: string;
  errorType: string;
  errorMessage: string;
  culpritFile?: string;
  firstSeen: Date;
  lastSeen: Date;
  raw: Record<string, unknown>;
}

/** Verify the `sentry-hook-signature` header (HMAC-SHA256 of the raw body). */
export function verifySignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface SentryIssuePayload {
  data?: {
    issue?: {
      id?: string;
      title?: string;
      culprit?: string;
      level?: string;
      project?: string;
      fingerprint?: string[];
      metadata?: { type?: string; value?: string };
      firstSeen?: string;
      lastSeen?: string;
    };
  };
  // Our synthetic payloads may carry an explicit fingerprint + culprit file.
  _fingerprint?: string;
  _culpritFile?: string;
}

function toDate(s?: string): Date {
  const d = s ? new Date(s) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Map a Sentry issue webhook payload to our canonical error shape. */
export function normalizeSentryWebhook(payload: SentryIssuePayload): NormalizedError {
  const issue = payload.data?.issue ?? {};
  const meta = issue.metadata ?? {};
  const fingerprint =
    payload._fingerprint ??
    issue.fingerprint?.[0] ??
    `${issue.project ?? "unknown"}/${issue.culprit ?? "unknown"}/${meta.type ?? "Error"}`;

  return {
    source: "sentry",
    externalId: issue.id ?? fingerprint,
    fingerprint,
    title: issue.title ?? `${meta.type ?? "Error"}: ${meta.value ?? ""}`.trim(),
    service: issue.project ?? "unknown",
    severity: issue.level ?? "error",
    errorType: meta.type ?? "Error",
    errorMessage: meta.value ?? issue.title ?? "",
    culpritFile: payload._culpritFile ?? issue.culprit,
    firstSeen: toDate(issue.firstSeen),
    lastSeen: toDate(issue.lastSeen),
    raw: payload as Record<string, unknown>,
  };
}

let simSeq = 0;

/** Build a synthetic Sentry webhook payload for a seeded bug (simulation). */
export function syntheticSentryEvent(
  bug: SeededBug,
  opts: { externalId?: string; firstSeen?: string; lastSeen?: string } = {},
): SentryIssuePayload {
  simSeq += 1;
  const id = opts.externalId ?? `sim-issue-${bug.key}-${simSeq}`;
  return {
    data: {
      issue: {
        id,
        title: bug.title,
        culprit: bug.culpritFile,
        level: bug.severity,
        project: bug.service,
        metadata: { type: bug.errorType, value: bug.errorMessage },
        firstSeen: opts.firstSeen,
        lastSeen: opts.lastSeen,
      },
    },
    _fingerprint: bug.fingerprint,
    _culpritFile: bug.culpritFile,
  };
}
