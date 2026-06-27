import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "@/lib/config";
import { extractJson, anthropicText } from "@/lib/agents/json";
import { chatJson, isConfigured, type CompatProvider } from "@/lib/agents/openai-compat";
import { httpError } from "@/lib/http";
import { getBugByFingerprint } from "@/lib/sim/bugs";
import { createBranch, applyEdit, commitAll, gatherCallerContext } from "@/lib/adapters/workspace";
import { isLiveRuntime, assignedProvider, assignedPid } from "@/lib/runtime-config";
import type { Fixer, FixerContext, FixProposal } from "@/lib/agents/types";

function branchName(incidentId: string): string {
  return `warden/fix-${incidentId.slice(0, 8)}`;
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
 * workspace (no merge, no deploy; PLAN §5.1). The simulation applies the real
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
    // Reviewer has something real to object to. On a revision we DROP it and ship
    // the tightly-scoped fix, modelling the Fixer acting on the review feedback —
    // unless the scenario is "stubborn" (it keeps over-scoping, so the loop
    // exhausts its attempts and escalates).
    const tightened = !!bug.sloppyFix && !!ctx.revision && !bug.stubbornSloppy;
    if (bug.sloppyFix && !tightened) {
      await applyEdit(workspaceRoot, bug.sloppyFix);
      filesChanged.push(bug.sloppyFix.file);
    }

    // Only claim "tightened" when the patch ACTUALLY dropped the over-scoped edit;
    // a stubborn revision keeps server.js, so its summary must not say otherwise.
    const summary = tightened
      ? `${bug.fixSummary} (tightened to only the implicated file after review)`
      : bug.fixSummary;
    const commitSha = await commitAll(workspaceRoot, `fix: ${bug.title}`);
    return { branch, commitSha, diffSummary: summary, filesChanged };
  },
};

const FIX_PROMPT =
  'You fix a file so a production error stops. Respond ONLY with a JSON object {"newContent": string (the FULL corrected file contents), "summary": string (one plain-English sentence for a non-technical founder)}.';

function fixUser(ctx: FixerContext, file: string, original: string, callers: string): string {
  const feedback = ctx.revision?.notes?.length
    ? `\n\nA previous attempt was rejected by review. Address this and keep the patch tightly scoped to ONLY ${file}:\n- ${ctx.revision.notes.join("\n- ")}`
    : "";
  const callerBlock = callers ? `\n\n${callers}` : "";
  return `Root cause: ${ctx.investigation.root_cause}${feedback}\n\nFile ${file}:\n\`\`\`\n${original}\n\`\`\`${callerBlock}`;
}

/** Any OpenAI-compatible provider (DeepSeek, GLM, OpenAI, …); the provider is
 * resolved from the dashboard assignment or env config by the factory below. */
function makeCompatFixer(provider: CompatProvider, name = "agent"): Fixer {
  return {
    name,
    async propose(ctx: FixerContext): Promise<FixProposal> {
      const { file, path } = culprit(ctx);
      const original = await readFile(path, "utf8");
      const callers = await gatherCallerContext(ctx.workspaceRoot, file);
      const parsed = await chatJson<{ newContent: string; summary: string }>(
        provider,
        FIX_PROMPT,
        fixUser(ctx, file, original, callers),
      );
      return commitRewrite(ctx, file, path, parsed.newContent, parsed.summary);
    },
  };
}

/** Native Anthropic Messages API. (Untested without keys.) */
const liveFixer: Fixer = {
  name: "claude",
  async propose(ctx: FixerContext): Promise<FixProposal> {
    const { file, path } = culprit(ctx);
    const original = await readFile(path, "utf8");
    const callers = await gatherCallerContext(ctx.workspaceRoot, file);
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
        messages: [
          { role: "user", content: `${FIX_PROMPT}\n\n${fixUser(ctx, file, original, callers)}` },
        ],
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
  // Live if the env (config.isLive) OR the dashboard overlay (isLiveRuntime) says
  // so. Provider precedence: dashboard assignment → env OpenAI-compatible config
  // → native Anthropic → simulation.
  if (!(config.isLive || isLiveRuntime())) return simFixer;
  const assigned = assignedProvider("FIXER_MODEL");
  if (assigned) return makeCompatFixer(assigned, assignedPid("FIXER_MODEL") ?? "agent");
  if (isConfigured(config.agents.fixer)) return makeCompatFixer(config.agents.fixer);
  if (config.agents.anthropicApiKey) return liveFixer;
  return simFixer;
}
