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
  /** The commit the error fired on (from Sentry's release), when SHA-like. Lets a
   *  fix reconcile the trace against the current repo HEAD. */
  deployedCommit?: string;
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

/**
 * A Sentry event. The issue-alert webhook delivers it under `data.event`; the
 * internal-integration "error" webhook delivers it under `data.error`. Either way
 * it carries the stack trace and the captured request the verification gate needs,
 * so we accept both and read the same fields from whichever is present.
 */
interface SentryEvent {
  release?: string;
  event_id?: string;
  title?: string;
  culprit?: string;
  transaction?: string;
  level?: string;
  metadata?: { type?: string; value?: string };
  project?: string | { slug?: string; name?: string };
  exception?: {
    values?: { type?: string; value?: string; stacktrace?: { frames?: StackFrame[] } }[];
  };
  request?: { method?: string; url?: string; data?: unknown };
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
    event?: SentryEvent;
    error?: SentryEvent;
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

/**
 * The deployed commit the event came from, parsed from Sentry's `release`. Releases
 * are commonly `<name>@<version>`; we take the trailing segment and keep it only
 * when it looks like a git SHA, so it can be reconciled against the repo. Vercel's
 * Sentry integration sets the release to the commit SHA, so this is populated for
 * the common deploy setup; otherwise it's left undefined.
 */
function commitFromRelease(release?: string): string | undefined {
  if (!release) return undefined;
  const tail = release.trim().split("@").pop() ?? "";
  return /^[0-9a-f]{7,40}$/i.test(tail) ? tail.toLowerCase() : undefined;
}

/**
 * A Sentry stack-frame filename reduced to a repo-relative path. Sentry and the
 * bundler prefix frames a few ways (`app:///`, `webpack-internal:///(rsc)/./`, a
 * leading `./`); strip those so the path matches a file in the cloned repo.
 */
function normalizeFramePath(filename?: string): string | undefined {
  if (!filename) return undefined;
  const p = filename
    .trim()
    .replace(/^app:\/\/\//, "")
    .replace(/^webpack-internal:\/\/\/(\([^)]*\)\/)?/, "")
    .replace(/^\.\//, "");
  return p || undefined;
}

/**
 * Map a Sentry webhook payload to our canonical error shape. Handles both the
 * issue webhook (issue summary, no stack trace) and the "error" / alert webhook
 * (the full event with the stack trace + request). Fields fall back from the issue
 * to the event, so either delivery yields the culprit file and the failing request
 * the verification gate needs.
 */
export function normalizeSentryWebhook(payload: SentryIssuePayload): NormalizedError {
  const issue = payload.data?.issue ?? {};
  // The full event arrives under data.event (alert) or data.error ("error"
  // webhook); both carry the stack trace + request the verification gate replays.
  const event = payload.data?.event ?? payload.data?.error;
  const exc = event?.exception?.values?.[0];
  const meta = issue.metadata ?? event?.metadata ?? {};
  const frame = pickCulpritFrame(exc?.stacktrace?.frames);
  const service = projectName(issue.project ?? event?.project);

  const errorType = meta.type ?? exc?.type ?? "Error";
  const errorMessage = meta.value ?? exc?.value ?? issue.title ?? event?.title ?? "";

  const culpritFile =
    payload._culpritFile ??
    normalizeFramePath(frame?.filename) ??
    issue.culprit ??
    event?.culprit ??
    undefined;
  const culpritFunction = payload._culpritFunction ?? frame?.function ?? undefined;

  const fingerprint =
    payload._fingerprint ??
    issue.fingerprint?.[0] ??
    `${service}/${issue.culprit ?? culpritFile ?? "unknown"}/${errorType}`;

  const triggeringRequest =
    payload._triggeringRequest ?? (event ? pickTriggeringRequest(event) : undefined);
  const httpRequest = payload._httpRequest ?? (event ? pickHttpRequest(event) : undefined);
  const deployedCommit = commitFromRelease(event?.release);

  return {
    source: "sentry",
    externalId: issue.id ?? event?.event_id ?? fingerprint,
    fingerprint,
    title: issue.title ?? event?.title ?? `${errorType}: ${errorMessage}`.trim(),
    service,
    severity: issue.level ?? event?.level ?? "error",
    errorType,
    errorMessage,
    culpritFile,
    culpritFunction,
    triggeringRequest,
    httpRequest,
    deployedCommit,
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