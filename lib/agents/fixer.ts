import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config, live } from "@/lib/config";
import { extractJson, anthropicText } from "@/lib/agents/json";
import { httpError } from "@/lib/http";
import { getBugByFingerprint } from "@/lib/sim/bugs";
import { createBranch, applyEdit, commitAll } from "@/lib/adapters/workspace";
import type { Fixer, FixerContext, FixProposal } from "@/lib/agents/types";

function branchName(incidentId: string): string {
  return `nightshift/fix-${incidentId.slice(0, 8)}`;
}

/**
 * Fixer = Claude. It writes a patch on a NEW branch in the per-incident
 * workspace — no merge, no deploy (PLAN §5.1). The simulation applies the real
 * fix from the bug catalog so the verification gate genuinely passes only when
 * the code is actually repaired.
 */
const simFixer: Fixer = {
  name: "claude",
  async propose(ctx: FixerContext): Promise<FixProposal> {
    const { incident, workspaceRoot } = ctx;
    const bug = getBugByFingerprint(incident.fingerprint);
    if (!bug) {
      throw new Error(`sim fixer has no patch recipe for ${incident.fingerprint}`);
    }
    const branch = branchName(incident.id);
    await createBranch(workspaceRoot, branch);

    await applyEdit(workspaceRoot, bug.fix);
    const filesChanged = [bug.culpritFile];

    // A deliberately over-scoped patch (only on the "risky" scenario) so the
    // Reviewer has something real to object to.
    if (bug.sloppyFix) {
      await applyEdit(workspaceRoot, bug.sloppyFix);
      filesChanged.push(bug.sloppyFix.file);
    }

    const commitSha = await commitAll(workspaceRoot, `fix: ${bug.title}`);
    return { branch, commitSha, diffSummary: bug.fixSummary, filesChanged };
  },
};

const liveFixer: Fixer = {
  name: "claude",
  async propose(ctx: FixerContext): Promise<FixProposal> {
    // Live path: ask Claude to rewrite the culprit file, then apply + commit.
    // (Untested without keys; gated behind live.fixer().)
    const culprit =
      (ctx.investigation.context as { culpritFile?: string } | null)?.culpritFile ??
      "src/index.js";
    const path = join(ctx.workspaceRoot, culprit);
    const original = await readFile(path, "utf8");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.agents.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.agents.anthropicModel,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: `Fix this file so the error stops. Respond ONLY with JSON {"newContent": string, "summary": string}.\n\nRoot cause: ${ctx.investigation.root_cause}\n\nFile ${culprit}:\n\`\`\`\n${original}\n\`\`\``,
          },
        ],
      }),
    });
    if (!res.ok) await httpError("anthropic", res);
    const parsed = extractJson<{ newContent: string; summary: string }>(
      anthropicText(await res.json()),
    );

    const branch = branchName(ctx.incident.id);
    await createBranch(ctx.workspaceRoot, branch);
    await writeFile(path, parsed.newContent, "utf8");
    const commitSha = await commitAll(ctx.workspaceRoot, `fix: ${ctx.incident.title}`);
    return {
      branch,
      commitSha,
      diffSummary: parsed.summary,
      filesChanged: [culprit],
    };
  },
};

export function getFixer(): Fixer {
  return live.fixer() ? liveFixer : simFixer;
}
