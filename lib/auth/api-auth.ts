/**
 * Shared-secret gate for sensitive routes (approve / rollback / orchestrator
 * tick / oauth disconnect). Requests must present the secret as
 * `Authorization: Bearer <secret>` or `x-warden-secret`.
 *
 * Two secrets are accepted: WARDEN_API_SECRET (the operator's gate) and
 * CRON_SECRET (what Vercel Cron sends as `Authorization: Bearer <CRON_SECRET>`
 * when it invokes the tick). When NEITHER is set the gate is open in dev/sim but
 * fails CLOSED in live, so the state-mutating routes are never world-writable in
 * production. Full multi-tenant auth (deriving the approver identity from an
 * authenticated session rather than the request body) remains a go-live item
 * (PLAN §11; see docs/operations/go-live.md).
 */
import { timingSafeEqual } from "node:crypto";
import { isLiveRuntime } from "@/lib/runtime-config";

function configuredSecrets(): string[] {
  return [process.env.WARDEN_API_SECRET, process.env.CRON_SECRET]
    .map((s) => s?.trim())
    .filter((s): s is string => !!s);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Returns a 401/503 Response to short-circuit, or null to proceed. */
export function checkApiSecret(req: Request): Response | null {
  const secrets = configuredSecrets();
  if (secrets.length === 0) {
    // No secret configured: open in dev/sim, fail closed in live.
    if (isLiveRuntime()) {
      return Response.json({ error: "api secret not configured" }, { status: 503 });
    }
    return null;
  }
  const auth = req.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ")
    ? auth.slice(7)
    : req.headers.get("x-warden-secret") || "";
  if (provided && secrets.some((s) => safeEqual(provided, s))) return null;
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

/**
 * Gate for the operator console's own state changes (approve / reject / dismiss /
 * rollback). A configured secret is still accepted if presented (scripted
 * callers), but unlike `checkApiSecret` this does NOT fail closed when no
 * credential is presented: the dashboard is the single operator's own console and
 * can't send the secret from the browser. Enable Clerk to attribute and gate these
 * per user; the strict secret gate stays on the external routes (orchestrator tick,
 * oauth disconnect).
 */
export function checkOperator(req: Request): Response | null {
  const secrets = configuredSecrets();
  if (secrets.length === 0) return null;
  const auth = req.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ")
    ? auth.slice(7)
    : req.headers.get("x-warden-secret") || "";
  if (!provided) return null; // the dashboard sends no credential: allow
  return secrets.some((s) => safeEqual(provided, s))
    ? null
    : Response.json({ error: "unauthorized" }, { status: 401 });
}
