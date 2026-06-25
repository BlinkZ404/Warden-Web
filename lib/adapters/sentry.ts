/**
 * Sentry error-source adapter (PLAN §7). A pluggable trigger: live mode parses
 * real Sentry issue webhooks (with HMAC signature verification); simulation mode
 * emits synthetic Sentry-shaped payloads for the seeded bugs, which flow through
 * the same normalize path so ingest code is not special-cased per mode.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SeededBug } from "@/lib/sim/bugs";
import type { IncidentSource } from "@/lib/db/types";

export interface NormalizedError {
  source: IncidentSource;
  externalId: string;
  fingerprint: string;
  title: string;
  service: string;
  severity: string;
  errorType: string;
  errorMessage: string;
  culpritFile?: string;
  /** Frame function that threw; used to build the reproduction descriptor. */
  culpritFunction?: string;
  /** Captured request body / args that triggered the crash. */
  triggeringRequest?: unknown;
  /** The full captured HTTP request, for booting the app and replaying it. */
  httpRequest?: { method: string; path: string; body?: unknown };
  firstSeen: Date;
  lastSeen: Date;
  raw: Record<string, unknown>;
}

function hmacHex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function digestMatches(expectedHex: string, signature: string): boolean {
  const a = Buffer.from(expectedHex);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verify the `sentry-hook-signature` header. Sentry's documented verifier signs
 * `JSON.stringify(request.body)` (the parsed body, re-serialized) rather than the
 * raw transmitted bytes, so we canonicalize the body the same way before HMAC.
 * We also accept a match against the raw bytes, so a payload that happens to be
 * signed over the exact wire body still verifies; both forms require the secret,
 * so accepting either does not weaken the check.
 */
export function verifySignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!secret || !signature) return false;
  const candidates = [rawBody];
  try {
    candidates.push(JSON.stringify(JSON.parse(rawBody)));
  } catch {
    /* non-JSON body: only the raw form is meaningful */
  }
  return candidates.some((body) => digestMatches(hmacHex(secret, body), signature));
}

interface StackFrame {
  function?: string;
  filename?: string;
  in_app?: boolean;
}

interface SentryIssuePayload {
  data?: {
    issue?: {
      id?: string;
      title?: string;
      culprit?: string;
      level?: string;
      // Sentry sends `project` as an object on real issue webhooks ({id,name,
      // slug,platform}); synthetic sim payloads send a bare string. Accept both.
      project?: string | { slug?: string; name?: string };
      fingerprint?: string[];
      metadata?: { type?: string; value?: string };
      firstSeen?: string;
      lastSeen?: string;
    };
    event?: {
      exception?: { values?: { stacktrace?: { frames?: StackFrame[] } }[] };
      request?: { method?: string; url?: string; data?: unknown };
    };
  };
  // Synthetic payloads may carry explicit fingerprint + reproduction signal.
  _fingerprint?: string;
  _culpritFile?: string;
  _culpritFunction?: string;
  _triggeringRequest?: unknown;
  _httpRequest?: { method: string; path: string; body?: unknown };
}

function toDate(s?: string): Date {
  const d = s ? new Date(s) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function pickCulpritFrame(frames: StackFrame[] | undefined): StackFrame | undefined {
  if (!frames?.length) return undefined;
  const inApp = frames.filter((f) => f.in_app !== false && f.filename);
  const pool = inApp.length ? inApp : frames.filter((f) => f.filename);
  return pool[pool.length - 1];
}

function pickTriggeringRequest(event?: { request?: { data?: unknown } }): unknown {
  const req = event?.request;
  if (!req) return undefined;
  if (req.data !== undefined && req.data !== null) return req.data;
  return req;
}

/**
 * The full failing HTTP request (method + path + body), when Sentry captured it.
 * This is what `reproduceRequest` boots the app and replays; a bare path is kept
 * as-is, an absolute URL is reduced to its path + query.
 */
function pickHttpRequest(
  event?: { request?: { method?: string; url?: string; data?: unknown } },
): { method: string; path: string; body?: unknown } | undefined {
  const req = event?.request;
  if (!req?.method || !req?.url) return undefined;
  let path = req.url;
  try {
    const u = new URL(req.url);
    path = u.pathname + u.search;
  } catch {
    /* url is already a path */
  }
  return { method: req.method, path, body: req.data };
}

/** Resolve the human-readable service name from Sentry's string-or-object `project`. */
function projectName(project?: string | { slug?: string; name?: string }): string {
  if (!project) return "unknown";
  if (typeof project === "string") return project;
  return project.slug ?? project.name ?? "unknown";
}

/** Map a Sentry issue webhook payload to our canonical error shape. */
export function normalizeSentryWebhook(payload: SentryIssuePayload): NormalizedError {
  const issue = payload.data?.issue ?? {};
  const meta = issue.metadata ?? {};
  const event = payload.data?.event;
  const frames = event?.exception?.values?.[0]?.stacktrace?.frames;
  const frame = pickCulpritFrame(frames);
  const service = projectName(issue.project);

  const fingerprint =
    payload._fingerprint ??
    issue.fingerprint?.[0] ??
    `${service}/${issue.culprit ?? "unknown"}/${meta.type ?? "Error"}`;

  const culpritFile =
    payload._culpritFile ?? frame?.filename ?? issue.culprit ?? undefined;
  const culpritFunction = payload._culpritFunction ?? frame?.function ?? undefined;
  const triggeringRequest =
    payload._triggeringRequest ?? (event ? pickTriggeringRequest(event) : undefined);
  const httpRequest = payload._httpRequest ?? (event ? pickHttpRequest(event) : undefined);

  return {
    source: "sentry",
    externalId: issue.id ?? fingerprint,
    fingerprint,
    title: issue.title ?? `${meta.type ?? "Error"}: ${meta.value ?? ""}`.trim(),
    service,
    severity: issue.level ?? "error",
    errorType: meta.type ?? "Error",
    errorMessage: meta.value ?? issue.title ?? "",
    culpritFile,
    culpritFunction,
    triggeringRequest,
    httpRequest,
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
  const repro = bug.repro;
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
    _culpritFunction: repro?.export,
    _triggeringRequest: repro?.args?.length === 1 ? repro.args[0] : repro?.args,
  };
}