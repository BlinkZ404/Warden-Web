import { config } from "@/lib/config";
import { chatJson, isConfigured } from "@/lib/agents/openai-compat";
import {
  diffStat,
  diffText,
  fileHistory,
  revParse,
} from "@/lib/adapters/workspace";
import type { ReviewVerdict } from "@/lib/db/types";
import type { Reviewer, ReviewerContext, ReviewResult, ReviewFindings } from "@/lib/agents/types";

// The Reviewer runs on its own configured provider (so the cross-check can use a
// different model family than the Fixer), falling back to native OpenAI.
function reviewerProvider() {
  return isConfigured(config.agents.reviewer)
    ? config.agents.reviewer
    : {
        baseUrl: "https://api.openai.com/v1",
        apiKey: config.agents.openaiApiKey,
        model: config.agents.openaiModel,
      };
}

/**
 * Reviewer = Codex (a different model family from the Fixer). The simulation
 * does REAL deterministic work on the actual diff and git history — scope,
 * whether the fix touches the file the error implicates, unrelated files, and
 * overlap with recently-changed code — rather than returning a canned verdict.
 * This is the product's "verify-not-review" cross-check (PLAN §3, §5.4, §10),
 * so it must produce a real signal: disagreement → escalate.
 */
const simReviewer: Reviewer = {
  name: "codex",
  async review(ctx: ReviewerContext): Promise<ReviewResult> {
    const { workspaceRoot: root, baseRef, headRef, culpritFile } = ctx;
    const stat = await diffStat(root, baseRef, headRef);

    const touchesCulprit = culpritFile ? stat.files.includes(culpritFile) : true;
    const unrelatedFiles = culpritFile
      ? stat.files.filter((f) => f !== culpritFile)
      : [];

    // Overlap with recently-changed code on the base branch.
    const baseHead = await revParse(root, baseRef);
    const recentlyChanged: { file: string; lastCommit: string }[] = [];
    const changedByLatest: string[] = [];
    for (const f of stat.files) {
      const hist = await fileHistory(root, f, { ref: baseRef, limit: 1 });
      if (hist[0]) {
        recentlyChanged.push({ file: f, lastCommit: hist[0].subject });
        if ((await revParse(root, hist[0].sha)) === baseHead) {
          changedByLatest.push(`${f} ("${hist[0].subject}")`);
        }
      }
    }

    const notes: string[] = [];
    let verdict: ReviewVerdict = "approve";

    if (!touchesCulprit) {
      notes.push(
        `The patch does not modify ${culpritFile}, the file implicated by the error.`,
      );
      verdict = "uncertain";
    }
    if (unrelatedFiles.length > 0) {
      notes.push(
        `The patch also changes unrelated file(s): ${unrelatedFiles.join(", ")}. An error fix should be tightly scoped.`,
      );
      if (verdict === "approve") verdict = "uncertain";
    }
    const churn = stat.insertions + stat.deletions;
    if (stat.filesChanged > 3 || churn > 60) {
      notes.push(`Large diff for an error fix (${stat.filesChanged} files, ${churn} lines).`);
      if (verdict === "approve") verdict = "uncertain";
    }
    // Clearly wrong: doesn't touch the culprit AND sprays across files.
    if (!touchesCulprit && stat.filesChanged >= 2) verdict = "reject";

    // Informational: overlap with the most recent commit on the base branch.
    if (changedByLatest.length > 0) {
      notes.push(
        `Overlaps the most recent commit on ${baseRef}: ${changedByLatest.join(", ")} — verify the fix doesn't conflict.`,
      );
    }

    if (verdict === "approve" && notes.length === 0) {
      notes.push("Tightly scoped patch touching only the implicated file.");
    }

    const findings: ReviewFindings = {
      scope: {
        filesChanged: stat.filesChanged,
        insertions: stat.insertions,
        deletions: stat.deletions,
        files: stat.files,
      },
      touchesCulprit,
      unrelatedFiles,
      recentlyChanged,
      notes,
    };

    const summary =
      verdict === "approve"
        ? "Independent review: scope looks right, touches only the implicated file."
        : verdict === "uncertain"
          ? "Independent review raised concerns — escalating rather than auto-handling."
          : "Independent review rejected the patch.";

    return { verdict, summary, findings };
  },
};

const liveReviewer: Reviewer = {
  name: "codex",
  async review(ctx: ReviewerContext): Promise<ReviewResult> {
    // Live path: send the diff + git history to Codex/OpenAI for a verdict.
    // (Untested without keys; gated behind live.reviewer().)
    const diff = await diffText(ctx.workspaceRoot, ctx.baseRef, ctx.headRef);
    const history = await fileHistory(ctx.workspaceRoot, ctx.culpritFile ?? "", {
      ref: ctx.baseRef,
      limit: 5,
    });
    const parsed = await chatJson<{
      verdict: ReviewVerdict;
      summary: string;
      notes: string[];
    }>(
      reviewerProvider(),
      'You are an independent code reviewer checking a production hotfix. Reply with a JSON object {"verdict":"approve|reject|uncertain","summary":string,"notes":string[]}. Check scope, regressions, and whether the fix targets the error. Prefer "uncertain" over approving a risky/over-scoped change.',
      `Diff:\n${diff}\n\nRecent history of the implicated file:\n${JSON.stringify(history)}`,
    );
    const stat = await diffStat(ctx.workspaceRoot, ctx.baseRef, ctx.headRef);
    return {
      verdict: parsed.verdict,
      summary: parsed.summary,
      findings: {
        scope: {
          filesChanged: stat.filesChanged,
          insertions: stat.insertions,
          deletions: stat.deletions,
          files: stat.files,
        },
        touchesCulprit: ctx.culpritFile ? stat.files.includes(ctx.culpritFile) : true,
        unrelatedFiles: [],
        recentlyChanged: [],
        notes: parsed.notes ?? [],
      },
    };
  },
};

export function getReviewer(): Reviewer {
  if (config.isLive && (isConfigured(config.agents.reviewer) || config.agents.openaiApiKey)) {
    return liveReviewer;
  }
  return simReviewer;
}
