/**
 * Optional shared-secret gate for sensitive routes (approve / rollback /
 * orchestrator tick). When WARDEN_API_SECRET is set, requests must present
 * it as `Authorization: Bearer <secret>` or `x-warden-secret`. When unset
 * (local dev / simulation) it's a no-op.
 *
 * This is a minimal CSRF/abuse guard — full multi-tenant auth (deriving the
 * approver identity from an authenticated session rather than the request body)
 * is an explicit go-live item (PLAN §11; see GO-LIVE.md).
 */
import { timingSafeEqual } from "node:crypto";

const SECRET = process.env.WARDEN_API_SECRET?.trim() || "";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Returns a 401 Response to short-circuit, or null to proceed. */
export function checkApiSecret(req: Request): Response | null {
  if (!SECRET) return null; // not configured → open (dev/sim)
  const auth = req.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ")
    ? auth.slice(7)
    : req.headers.get("x-warden-secret") || "";
  if (provided && safeEqual(provided, SECRET)) return null;
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
