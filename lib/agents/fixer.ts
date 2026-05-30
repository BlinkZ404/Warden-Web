import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "@/lib/config";
import { extractJson, anthropicText } from "@/lib/agents/json";
import { chatJson, isConfigured } from "@/lib/agents/openai-compat";
import { httpError } from "@/lib/http";
import { getBugByFingerprint } from "@/lib/sim/bugs";
import { createBranch, applyEdit, commitAll } from "@/lib/adapters/workspace";
import type { Fixer, FixerContext, FixProposal } from "@/lib/agents/types";

function branchName(incidentId: string): string {
  return `nightshift/fix-${incidentId.slice(0, 8)}`;
}

function culprit(ctx: FixerContext): { file: string; path: string } {
  const file =
    (ctx.investigation.context as { culpritFile?: string } | null)?.culpritFile ??
    "src/index.js";
  return { file, path: join(ctx.workspaceRoot, file) };
}

/** Write the rewritten file on a new branch and commit it (no merge, no deploy). */
async function commitRewrite(
  ctx: FixerContext,
  file: string,
  path: string,
  newContent: string,
  summary: string,
): Promise<FixProposal> {
  const branch = branchName(ctx.incident.id);
  await createBranch(ctx.workspaceRoot, branch);
  await writeFile(path, newContent, "utf8");
  const commitSha = await commitAll(ctx.workspaceRoot, `fix: ${ctx.incident.title}`);
  return { branch, commitSha, diffSummary: summary, filesChanged: [file] };
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

const FIX_PROMPT =
  'You fix a file so a production error stops. Respond ONLY with a JSON object {"newContent": string (the FULL corrected file contents), "summary": string (one plain-English sentence for a non-technical founder)}.';

function fixUser(ctx: FixerContext, file: string, original: string): string {
  return `Root cause: ${ctx.investigation.root_cause}\n\nFile ${file}:\n\`\`\`\n${original}\n\`\`\``;
}

/** Any OpenAI-compatible provider (DeepSeek, GLM, OpenAI, …) configured via env. */
const compatFixer: Fixer = {
  name: "agent",
  async propose(ctx: FixerContext): Promise<FixProposal> {
    const { file, path } = culprit(ctx);
    const original = await readFile(path, "utf8");
    const parsed = await chatJson<{ newContent: string; summary: string }>(
      config.agents.fixer,
      FIX_PROMPT,
      fixUser(ctx, file, original),
    );
    return commitRewrite(ctx, file, path, parsed.newContent, parsed.summary);
  },
};

/** Native Anthropic Messages API. (Untested without keys.) */
const liveFixer: Fixer = {
  name: "claude",
  async propose(ctx: FixerContext): Promise<FixProposal> {
    const { file, path } = culprit(ctx);
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
        max_tokens: 8192,
        messages: [{ role: "user", content: `${FIX_PROMPT}\n\n${fixUser(ctx, file, original)}` }],
      }),
    });
    if (!res.ok) await httpError("anthropic", res);
    const parsed = extractJson<{ newContent: string; summary: string }>(
      anthropicText(await res.json()),
    );
    return commitRewrite(ctx, file, path, parsed.newContent, parsed.summary);
  },
};

export function getFixer(): Fixer {
  if (config.isLive && isConfigured(config.agents.fixer)) return compatFixer;
  if (config.isLive && config.agents.anthropicApiKey) return liveFixer;
  return simFixer;
}
