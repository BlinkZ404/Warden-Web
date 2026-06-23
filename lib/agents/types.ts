/**
 * Pluggable agent interfaces (PLAN §3, §7, §15). Error sources and agents are
 * adapters, not the product. The Fixer (Claude) and Reviewer (Codex) are
 * deliberately different model families so their cross-check is a real (if weak,
 * per §5.4) independent signal.
 */
import type { Incident, Investigation, FixAttempt, ReviewVerdict } from "@/lib/db/types";

export interface SentryContext {
  externalId: string | null;
  errorType: string;
  errorMessage: string;
  culpritFile?: string;
  culpritFunction?: string;
  triggeringRequest?: unknown;
  httpRequest?: { method: string; path: string; body?: unknown };
  service?: string | null;
  raw?: Record<string, unknown>;
}

export interface InvestigationResult {
  rootCause: string;
  confidence: number; // 0..1
  context: Record<string, unknown>;
}

export interface FixProposal {
  branch: string;
  commitSha: string;
  diffSummary: string; // plain-English, for the founder
  filesChanged: string[];
}

export interface ReviewFindings {
  scope: {
    filesChanged: number;
    insertions: number;
    deletions: number;
    files: string[];
  };
  touchesCulprit: boolean;
  unrelatedFiles: string[];
  recentlyChanged: { file: string; lastCommit: string }[];
  notes: string[];
}

export interface ReviewResult {
  verdict: ReviewVerdict;
  summary: string;
  findings: ReviewFindings;
}

export interface Investigator {
  name: string;
  investigate(incident: Incident, sentry: SentryContext): Promise<InvestigationResult>;
}

/** Feedback for a re-proposal after a reviewer rejected the prior attempt. */
export interface FixRevision {
  /** How many attempts have already been rejected (0 on the first try). */
  attempt: number;
  /** The reviewer's actionable notes for the Fixer to address. */
  notes: string[];
}

export interface FixerContext {
  incident: Incident;
  investigation: Investigation;
  workspaceRoot: string;
  /** Set when re-proposing after review; the Fixer should tighten scope and
   * address `revision.notes` rather than repeating the rejected patch. */
  revision?: FixRevision;
}

export interface Fixer {
  name: string;
  propose(ctx: FixerContext): Promise<FixProposal>;
}

export interface ReviewerContext {
  incident: Incident;
  fixAttempt: FixAttempt;
  workspaceRoot: string;
  baseRef: string;
  headRef: string;
  culpritFile?: string;
}

export interface Reviewer {
  name: string;
  review(ctx: ReviewerContext): Promise<ReviewResult>;
}
