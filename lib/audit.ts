/** Pure, client-safe formatters for the immutable event log (no server deps). */

/** `state_change` → `State change`. */
export function humanizeType(type: string): string {
 const t = type.replace(/_/g, " ");
 return t.charAt(0).toUpperCase() + t.slice(1);
}

function humanizeState(s: unknown): string {
 return String(s ?? "").replace(/_/g, " ");
}

/** A readable one-line summary of an event, rather than its raw JSON payload. */
export function eventSummary(
 type: string,
 payload: Record<string, unknown>,
 max = 150): string {
 const p = payload ?? {};
 const str = (k: string) => (p[k] == null ? "" : String(p[k]));
 let out: string;
 switch (type) {
 case "state_change":
 out = `${humanizeState(p.from)} → ${humanizeState(p.to)}`;
 break;
 case "agent_action": {
 const action = str("action").replace(/_/g, " ");
 if (p.branch) out = `${action} · ${str("branch")}`;
 else if (Array.isArray(p.notes) && p.notes.length) out = `${action} · ${String(p.notes[0])}`;
 else out = action || "action";
 break;
 }
 case "ingest":
 out = [str("errorType"), str("errorMessage")].filter(Boolean).join(": ");
 break;
 case "gate":
 out = `${str("gate")} ${p.pass ? "passed" : "failed"}`;
 break;
 case "verification": {
 // `new_errors` is a count on the event payload but an array on the row;
 // normalize both to a length so an empty array does not read as truthy.
 const newCount = Array.isArray(p.new_errors)
 ? p.new_errors.length
 : Number(p.new_errors) || 0;
 out = [
 p.test_passed ? "tests pass" : "tests fail",
 p.error_recurred ? "error recurred" : "error gone",
 newCount ? "new errors" : "no new errors",
 ].join(" · ");
 break;
 }
 case "repro": {
 const call = [str("module"), str("export")].filter(Boolean).join(".");
 out = `${p.passed ? "reproduction passes" : "still reproduces"}${call ? ` · ${call}()` : ""}`;
 break;
 }
 case "consensus":
 out = str("reason");
 break;
 case "workspace":
 out = str("note");
 break;
 case "deploy":
 out = p.promoted ? `promoted → ${str("prodUrl")}` : str("prodUrl");
 break;
 case "rollback":
 out = str("reason");
 break;
 case "duplicate":
 out = str("note") || "duplicate suppressed";
 break;
 default:
 out = Object.entries(p)
 .slice(0, 3)
 .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
 .join(" · ");
 }
 return out.length > max ? out.slice(0, Math.max(1, max - 1)) + "…" : out;
}
