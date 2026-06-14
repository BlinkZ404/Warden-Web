/**
 * The guardrail / policy layer (PLAN §5, §10).
 *
 * Two distinct ideas, deliberately kept separate:
 *
 *  1. Multi-agent agreement is a FILTER, never the safety net (§5.4). The
 *     Reviewer disagreeing is treated as "don't auto-handle" → escalate.
 *
 *  2. Deterministic verification is the REAL gate (§5.3): the test passes, the
 *     original error stops reproducing on the preview, and no new errors
 *     appear. Agent agreement can never override a failed deterministic check.
 */
import type { ReviewVerdict } from "@/lib/db/types";

export interface ConsensusDecision {
  proceed: boolean;
  escalate: boolean;
  reason: string;
}

/** §10: Reviewer verdict must be `approve`; uncertain/reject → escalate. */
export function consensusDecision(verdict: ReviewVerdict): ConsensusDecision {
  if (verdict === "approve") {
    return { proceed: true, escalate: false, reason: "reviewer approved" };
  }
  return {
    proceed: false,
    escalate: true,
    reason: `reviewer verdict was "${verdict}"; disagreement is surfaced as an escalation, not auto-handled`,
  };
}

export interface PanelConsensus {
  proceed: boolean;
  escalate: boolean;
  approvals: number;
  total: number;
  required: number;
  reason: string;
}

/**
 * Consensus across a reviewer PANEL (PLAN §5.4). Proceed only if at least
 * `requiredApprovals` reviewers approve (default is UNANIMOUS: all of them).
 * Any shortfall escalates, surfacing the dissent. Agreement is a filter, never
 * the safety net; the deterministic gate still runs afterward regardless.
 */
export function consensusOf(
  verdicts: { name: string; verdict: ReviewVerdict }[],
  requiredApprovals?: number | null,
): PanelConsensus {
  const total = verdicts.length;
  const required = Math.min(total, requiredApprovals ?? total); // default: unanimous
  const approvals = verdicts.filter((v) => v.verdict === "approve").length;
  const dissent = verdicts.filter((v) => v.verdict !== "approve");
  const proceed = total > 0 && approvals >= required;
  return {
    proceed,
    escalate: !proceed,
    approvals,
    total,
    required,
    reason: proceed
      ? `${approvals}/${total} reviewers approved (needed ${required})`
      : `only ${approvals}/${total} reviewers approved (needed ${required})` +
        (dissent.length
          ? `; dissent: ${dissent.map((d) => `${d.name}=${d.verdict}`).join(", ")}`
          : ""),
  };
}

export interface VerificationFacts {
  test_passed: boolean;
  error_recurred: boolean;
  new_errors: unknown[];
}

export interface GateResult {
  pass: boolean;
  reasons: string[];
}

/**
 * §10 code-fix conditions that must ALL hold before an incident can reach
 * awaiting_approval. This is the line a human approval cannot cross on its own.
 */
export function verificationGate(v: VerificationFacts): GateResult {
  const reasons: string[] = [];
  if (!v.test_passed) reasons.push("tests did not pass");
  if (v.error_recurred)
    reasons.push("the original error still reproduces on the preview");
  const newCount = Array.isArray(v.new_errors) ? v.new_errors.length : 0;
  if (newCount > 0) reasons.push(`${newCount} new error signature(s) introduced`);

  if (reasons.length === 0) {
    return {
      pass: true,
      reasons: [
        "tests pass",
        "original error no longer reproduces",
        "no new error signatures",
      ],
    };
  }
  return { pass: false, reasons };
}

/** Scope sanity (§10): the diff should plausibly relate to the error. */
export function scopeIsSane(input: {
  filesChanged: number;
  churn: number;
  touchesCulprit: boolean;
  unrelatedFiles: number;
}): GateResult {
  const reasons: string[] = [];
  if (!input.touchesCulprit) reasons.push("fix does not touch the implicated file");
  if (input.unrelatedFiles > 0) reasons.push("fix touches unrelated files");
  if (input.filesChanged > 5) reasons.push("too many files changed");
  if (input.churn > 120) reasons.push("diff is very large");
  return { pass: reasons.length === 0, reasons };
}

export interface ScopePolicy {
  maxFiles: number;
  maxChurn: number;
  denyGlobs: string[];
}

/** Match a repo-relative path against a simple glob (`*`, `**`, literal `?`). */
export function pathMatchesGlob(filePath: string, glob: string): boolean {
  const norm = filePath.replace(/\\/g, "/");
  const g = glob.replace(/\\/g, "/");
  let re = "";
  for (let i = 0; i < g.length; i++) {
    if (g.startsWith("**/", i)) {
      re += "(?:.*/)?";
      i += 2;
    } else if (g.startsWith("/**", i)) {
      re += "(?:/.*)?";
      i += 2;
    } else if (g.startsWith("**", i)) {
      re += ".*";
      i += 1;
    } else if (g[i] === "*") {
      re += "[^/]*";
    } else if (g[i] === "?") {
      re += "\\?";
    } else if ("\\+^${}()|[]".includes(g[i])) {
      re += `\\${g[i]}`;
    } else {
      re += g[i];
    }
  }
  return new RegExp(`^${re}$`).test(norm);
}

/**
 * Blast-radius policy (§10): per-tenant file count, churn, and protected-path
 * limits. Runs before review so an over-scoped fix escalates early.
 */
export function policyGate(
  scope: { files: string[]; filesChanged: number; churn: number },
  policy: ScopePolicy,
): GateResult {
  const reasons: string[] = [];
  if (scope.filesChanged > policy.maxFiles) reasons.push("too many files changed");
  if (scope.churn > policy.maxChurn) reasons.push("diff is too large");
  for (const file of scope.files) {
    if (policy.denyGlobs.some((g) => pathMatchesGlob(file, g))) {
      reasons.push(`protected path: ${file}`);
      break;
    }
  }
  return { pass: reasons.length === 0, reasons };
}

/**
 * AUDIT C1 deploy parity: promotion is allowed only when the deployment was
 * built from the exact commit we verified.
 */
export function deployParityOk(
  verifiedSha: string | null | undefined,
  builtSha: string | null | undefined,
): boolean {
  if (!verifiedSha || !builtSha) return false;
  return verifiedSha === builtSha;
}
