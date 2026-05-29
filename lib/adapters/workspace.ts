/**
 * Per-incident git workspace.
 *
 * The orchestrator never touches the real source tree. For each incident it
 * materializes an isolated copy of the target repo under
 * `.nightshift/workspaces/<incidentId>/`, seeded with a believable git history
 * (an import commit + the commit that "introduced" the bug). This gives:
 *
 *   - the Fixer a branch to work on (no merge, no deploy — PLAN §5.1),
 *   - the Reviewer real `git log`/`git diff`/`git blame` to analyze (PLAN §6/M6),
 *   - the verification gate a real tree to run tests + reproduction against.
 *
 * In live mode this is replaced by cloning the customer's GitHub repo; the
 * surface (branch / applyEdit / diff / test / reproduce) is identical.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdir, readFile, writeFile, rm, access } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { config } from "@/lib/config";
import type { CodeEdit, SeededBug } from "@/lib/sim/bugs";

const pexec = promisify(execFile);

const WORKSPACES_ROOT = resolve(process.cwd(), ".nightshift", "workspaces");

export interface Workspace {
  incidentId: string;
  root: string;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Run git in the workspace; throws with stderr on non-zero exit. */
async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await pexec("git", args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

async function gitInit(root: string) {
  await git(root, ["init", "-b", "main"]);
  await git(root, ["config", "user.email", "ci@nightshift.dev"]);
  await git(root, ["config", "user.name", "checkout-service ci"]);
  await git(root, ["config", "commit.gpgsign", "false"]);
}

/**
 * Build the workspace fresh: copy the target repo, init git, commit an import,
 * then (optionally) inject the active bug as a second commit so "production
 * main" actually contains the failing code and blame points at a real commit.
 */
export async function prepareWorkspace(
  incidentId: string,
  injectBug?: SeededBug,
): Promise<Workspace> {
  const root = join(WORKSPACES_ROOT, incidentId);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  const source = resolve(process.cwd(), config.targetRepoPath);
  await cp(source, root, {
    recursive: true,
    filter: (src) => !/[\\/](node_modules|\.git|\.next)([\\/]|$)/.test(src),
  });

  await gitInit(root);
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "Import checkout-service @ v1.2.0"]);

  if (injectBug) {
    await applyEdit(root, injectBug.inject);
    await git(root, ["add", "-A"]);
    // A plausible, recent culprit commit — the Reviewer will see the fix
    // overlaps this freshly-changed file.
    await git(root, ["commit", "-m", "feat: multi-currency pricing rollout"]);
  }

  return { incidentId, root };
}

export function workspacePath(incidentId: string): string {
  return join(WORKSPACES_ROOT, incidentId);
}

export async function workspaceExists(incidentId: string): Promise<boolean> {
  return exists(join(workspacePath(incidentId), ".git"));
}

/** Apply a find/replace edit to a file. Throws loudly if the anchor is absent. */
export async function applyEdit(root: string, edit: CodeEdit): Promise<void> {
  const file = join(root, edit.file);
  const before = await readFile(file, "utf8");
  if (!before.includes(edit.find)) {
    throw new Error(
      `applyEdit: anchor not found in ${edit.file}. The code may have drifted from the expected shape.`,
    );
  }
  await writeFile(file, before.replace(edit.find, edit.replace), "utf8");
}

export async function createBranch(root: string, branch: string): Promise<void> {
  // -B so a resumed run can recreate the branch idempotently.
  await git(root, ["checkout", "-B", branch]);
}

export async function commitAll(root: string, message: string): Promise<string> {
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

export async function currentBranch(root: string): Promise<string> {
  return git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
}

export async function revParse(root: string, ref: string): Promise<string> {
  return git(root, ["rev-parse", ref]);
}

// ── analysis primitives for the Reviewer ─────────────────────────────────────
export interface DiffStat {
  files: string[];
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export async function diffStat(
  root: string,
  base: string,
  head: string,
): Promise<DiffStat> {
  const out = await git(root, ["diff", "--numstat", `${base}..${head}`]);
  const files: string[] = [];
  let insertions = 0;
  let deletions = 0;
  for (const line of out.split("\n").filter(Boolean)) {
    const [add, del, file] = line.split("\t");
    insertions += Number(add) || 0;
    deletions += Number(del) || 0;
    if (file) files.push(file);
  }
  return { files, filesChanged: files.length, insertions, deletions };
}

export async function diffText(
  root: string,
  base: string,
  head: string,
): Promise<string> {
  return git(root, ["diff", `${base}..${head}`]);
}

export interface CommitInfo {
  sha: string;
  subject: string;
}

/** Recent commits touching `file` (most recent first) — the "recently changed?" check. */
export async function fileHistory(
  root: string,
  file: string,
  opts: { limit?: number; ref?: string } = {},
): Promise<CommitInfo[]> {
  const out = await git(root, [
    "log",
    opts.ref ?? "HEAD",
    `-n`,
    String(opts.limit ?? 5),
    "--format=%H%x09%s",
    "--",
    file,
  ]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [sha, subject] = l.split("\t");
      return { sha, subject };
    });
}

export async function recentCommits(root: string, limit = 10): Promise<CommitInfo[]> {
  const out = await git(root, ["log", "-n", String(limit), "--format=%H%x09%s"]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [sha, subject] = l.split("\t");
      return { sha, subject };
    });
}

// ── execution primitives for the verification gate ──────────────────────────
export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function run(root: string, cmd: string, args: string[]): Promise<RunResult> {
  try {
    const { stdout, stderr } = await pexec(cmd, args, {
      cwd: root,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof e.code === "number" ? e.code : 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? String(err),
    };
  }
}

/** Run the target app's test suite (PLAN M7: generate a smoke test if none). */
export async function runTests(root: string): Promise<RunResult> {
  // The sample app is zero-dependency and uses node:test, so this is hermetic.
  return run(root, "node", ["--test"]);
}

/** Replay the exact production-failing request. code 0 = error stopped. */
export async function reproduce(
  root: string,
  scenario: string,
  input: unknown,
): Promise<RunResult> {
  return run(root, "node", [
    join("scripts", "reproduce.js"),
    scenario,
    JSON.stringify(input),
  ]);
}

/** Best-effort cleanup of a workspace. */
export async function destroyWorkspace(incidentId: string): Promise<void> {
  await rm(workspacePath(incidentId), { recursive: true, force: true });
}

void dirname; // (reserved for live-mode clone path)
