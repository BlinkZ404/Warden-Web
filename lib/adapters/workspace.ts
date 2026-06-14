/**
 * Per-incident git workspace.
 *
 * The orchestrator never touches the real source tree. For each incident it
 * materializes an isolated copy of the target repo under
 * `.warden/workspaces/<incidentId>/`, seeded with a believable git history
 * (an import commit + the commit that "introduced" the bug). This gives:
 *
 *   - the Fixer a branch to work on (no merge, no deploy; PLAN §5.1),
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

const WORKSPACES_ROOT = resolve(process.cwd(), ".warden", "workspaces");

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
  await git(root, ["config", "user.email", "ci@warden.dev"]);
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
    // A plausible, recent culprit commit; the Reviewer will see the fix
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

/**
 * Apply a find/replace edit to a file. Idempotent: if the anchor is gone but the
 * replacement is already present (e.g. a retry after a crash that already applied
 * this edit), it's a no-op rather than a hard failure; otherwise a re-run of the
 * fix step would wedge the incident. Throws only when neither anchor nor result
 * is present (genuine drift).
 */
export async function applyEdit(root: string, edit: CodeEdit): Promise<void> {
  const file = join(root, edit.file);
  const before = await readFile(file, "utf8");
  if (!before.includes(edit.find)) {
    if (before.includes(edit.replace)) return; // already applied; idempotent no-op
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

/** Apply a unified diff (used to rebuild a fix branch from the persisted patch). */
export async function applyPatch(root: string, patch: string): Promise<void> {
  if (!patch.trim()) return;
  const patchFile = join(root, ".ns-rebuild.patch");
  await writeFile(patchFile, patch.endsWith("\n") ? patch : patch + "\n", "utf8");
  try {
    await git(root, ["apply", "--whitespace=nowarn", ".ns-rebuild.patch"]);
  } finally {
    await rm(patchFile, { force: true });
  }
}

export async function commitAll(root: string, message: string): Promise<string> {
  await git(root, ["add", "-A"]);
  // Tolerate a clean tree on idempotent re-runs (the edit was already applied +
  // committed before a crash): return the current HEAD rather than failing with
  // "nothing to commit".
  const status = await git(root, ["status", "--porcelain"]);
  if (status.trim() !== "") {
    await git(root, ["commit", "-m", message]);
  }
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

/** Recent commits touching `file` (most recent first): the "recently changed?" check. */
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
  /** For runTests: how many tests node:test actually collected (0 = none). */
  testsRun?: number;
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

/**
 * Run the target app's test suite. Also reports how many tests were actually
 * collected; `node --test` exits 0 even when it finds ZERO test files, so the
 * gate must not treat an empty run as a pass (a test-less repo would otherwise
 * sail through verification). The caller fails closed on testsRun === 0.
 */
export async function runTests(root: string): Promise<RunResult> {
  const result = await run(root, "node", ["--test"]);
  // node:test prints a summary line like "ℹ tests 5" / "# tests 5".
  const m = `${result.stdout}\n${result.stderr}`.match(
    /(?:^|\n)\s*(?:#|ℹ)\s*tests\s+(\d+)/,
  );
  return { ...result, testsRun: m ? Number(m[1]) : 0 };
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

/**
 * Generic reproduction descriptor: the culprit export + positional args, the
 * shape a live Sentry frame + captured request yields. `args` is ALWAYS a
 * positional argument list (wrap a single object as `[obj]`).
 */
export interface ReproDescriptor {
  module: string; // repo-relative, e.g. "src/checkout.js"
  export: string; // the culprit function
  args: unknown[]; // positional arguments
}

/**
 * Reproduce via the generic `--call` path: invoke the culprit export directly,
 * no named scenario required. This is the engine real (catalog-less) incidents
 * run through. code 0 = the error stopped, 1 = it still reproduces.
 */
export async function reproduceCall(
  root: string,
  descriptor: ReproDescriptor,
): Promise<RunResult> {
  return run(root, "node", [
    join("scripts", "reproduce.js"),
    "--call",
    JSON.stringify(descriptor),
  ]);
}

/**
 * Regression smoke battery (AUDIT H4): replay known-good inputs on the fixed
 * tree. Returns distinct error signatures introduced by the fix (empty = clean).
 */
export async function smokeNewErrors(
  root: string,
  descriptor: ReproDescriptor,
  smokeRequests: unknown[],
): Promise<string[]> {
  const seen = new Set<string>();
  for (const req of smokeRequests) {
    const args = Array.isArray(req) ? req : [req];
    const r = await reproduceCall(root, { ...descriptor, args });
    if (r.code !== 0) {
      const m = r.stderr.match(/THREW\s+(\w+)/);
      seen.add(m ? m[1] : "Error");
    }
  }
  return [...seen];
}

/** Best-effort cleanup of a workspace. */
export async function destroyWorkspace(incidentId: string): Promise<void> {
  await rm(workspacePath(incidentId), { recursive: true, force: true });
}

void dirname; // (reserved for live-mode clone path)
