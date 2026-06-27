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
import { execFile, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createServer as netCreateServer, connect as netConnect } from "node:net";
import { promisify } from "node:util";
import { cp, mkdir, readFile, writeFile, rm, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ensureTargetRepo, targetRepoUrl } from "@/lib/adapters/github-repo";
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
 * Build the workspace fresh.
 *
 * For a linked GitHub repo we copy the cached clone WITH its real git history so
 * a fix branch diffs cleanly against the real base (a clean, fix-only PR); the
 * bug is already in the real code, so nothing is synthesized.
 *
 * For the bundled sample app (simulation) we copy the files into a fresh repo,
 * commit a believable import, then optionally inject the active bug as the
 * culprit commit so "production main" contains the failing code and blame points
 * at a real commit.
 */
export async function prepareWorkspace(
  incidentId: string,
  injectBug?: SeededBug,
): Promise<Workspace> {
  const root = join(WORKSPACES_ROOT, incidentId);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  const source = await ensureTargetRepo();

  // Linked repo: keep .git so the fix branch shares the real history.
  if (targetRepoUrl() && (await exists(join(source, ".git")))) {
    await cp(source, root, {
      recursive: true,
      filter: (src) => !/[\\/](node_modules|\.next)([\\/]|$)/.test(src),
    });
    await git(root, ["config", "user.email", "ci@warden.dev"]);
    await git(root, ["config", "user.name", "warden"]);
    await git(root, ["config", "commit.gpgsign", "false"]);
    return { incidentId, root };
  }

  // Bundled sample app: copy files, synthesize a believable history.
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
  // Function replacement so `$`-sequences in the new text (e.g. `$1`, `$&`) are
  // written literally instead of being interpreted as String.replace patterns.
  await writeFile(file, before.replace(edit.find, () => edit.replace), "utf8");
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

/** The linked repo's default branch (the PR base). Falls back to "main". */
export async function remoteDefaultBranch(root: string): Promise<string> {
  try {
    const ref = await git(root, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
    return ref.replace(/^origin\//, "").trim() || "main";
  } catch {
    return "main";
  }
}

// ── fix context: the files that call the culprit (so a rewrite keeps contracts) ──

/** A module path reduced to its filename without extension, e.g. "checkout". */
function baseNoExt(p: string): string {
  const seg = p.replace(/\\/g, "/").split("/").pop() ?? p;
  return seg.replace(/\.[cm]?[jt]sx?$/, "");
}

/** The module specifiers imported on a line (from "x" / require("x")). */
function importPaths(line: string): string[] {
  const out: string[] = [];
  const re = /(?:from|require\()\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1]);
  return out;
}

/** Best-effort exported symbol names (regex, not a full parse). */
function exportedSymbols(src: string): string[] {
  const names = new Set<string>();
  for (const m of src.matchAll(
    /export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    names.add(m[1]);
  }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  for (const m of src.matchAll(/(?:module\.exports|exports)\.([A-Za-z_$][\w$]*)/g)) {
    names.add(m[1]);
  }
  return [...names];
}

/**
 * Context for the Fixer: the OTHER files that import the culprit, with the lines
 * that call into it. Handing the fixer the call sites it must not break is how a
 * single-file rewrite avoids changing a contract that breaks elsewhere — without
 * dumping the whole repo into the prompt. Bounded; returns "" when nothing
 * depends on the culprit or it exports nothing.
 */
export async function gatherCallerContext(
  root: string,
  culpritFile: string,
  limits: { files?: number; linesPerFile?: number } = {},
): Promise<string> {
  const maxFiles = limits.files ?? 6;
  const maxLines = limits.linesPerFile ?? 12;

  let culpritSrc: string;
  try {
    culpritSrc = await readFile(join(root, culpritFile), "utf8");
  } catch {
    return "";
  }
  const symbols = exportedSymbols(culpritSrc);
  if (symbols.length === 0) return "";
  const base = baseNoExt(culpritFile);

  let tracked: string[];
  try {
    tracked = (await git(root, ["ls-files"]))
      .split("\n")
      .map((s) => s.trim())
      .filter((f) => f && f !== culpritFile && /\.[cm]?[jt]sx?$/.test(f));
  } catch {
    return "";
  }

  const blocks: string[] = [];
  for (const f of tracked) {
    if (blocks.length >= maxFiles) break;
    let src: string;
    try {
      src = await readFile(join(root, f), "utf8");
    } catch {
      continue;
    }
    const lines = src.split("\n");
    if (!lines.some((l) => importPaths(l).some((p) => baseNoExt(p) === base))) continue;

    const picked: string[] = [];
    for (let i = 0; i < lines.length && picked.length < maxLines; i++) {
      const l = lines[i];
      const isImport = importPaths(l).some((p) => baseNoExt(p) === base);
      if (isImport || symbols.some((s) => l.includes(s))) picked.push(`  ${i + 1}: ${l.trim()}`);
    }
    if (picked.length) blocks.push(`${f}:\n${picked.join("\n")}`);
  }

  if (blocks.length === 0) return "";
  return (
    `Other files depend on ${culpritFile}. Keep these call sites working — do not change ` +
    `the exported names, signatures, or return shapes they rely on:\n\n` +
    blocks.join("\n\n")
  );
}

export async function revParse(root: string, ref: string): Promise<string> {
  return git(root, ["rev-parse", ref]);
}

/**
 * Check out a ref in the workspace. Used by the synthesized smoke battery to
 * baseline an input on the pre-fix tree, then restore the verified fix tree.
 */
export async function checkoutRef(root: string, ref: string): Promise<void> {
  await git(root, ["checkout", ref]);
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
 * The throw signature from a reproduce run: null if it ran clean, otherwise the
 * thrown constructor name (e.g. "TypeError"), parsed from the `THREW <Name>` line
 * `scripts/reproduce.js` prints. The single owner of that contract, shared by the
 * seeded battery here and the synthesized one (`lib/agents/smoke.ts`).
 */
export function throwSignature(r: RunResult): string | null {
  if (r.code === 0) return null;
  const m = r.stderr.match(/THREW\s+(\w+)/);
  return m ? m[1] : "Error";
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
    const sig = throwSignature(await reproduceCall(root, { ...descriptor, args }));
    if (sig) seen.add(sig);
  }
  return [...seen];
}

// ── request-replay reproduction (boot the app, replay the failing request) ──
// reproduceCall needs the culprit export + its exact args, which only works when
// the crash is shallow (the function is called with the request itself). For a
// DEEP crash — the failing function sits several calls below the handler and its
// arguments are derived, not the raw request — the faithful reproduction is to
// BOOT the app and replay the captured HTTP request through its real entry point.
// A 5xx means the error still fires; this is the path real web incidents run.

export interface RequestSpec {
  method: string;
  path: string; // e.g. "/api/checkout"
  body?: unknown; // JSON body; sent for non-GET methods
  headers?: Record<string, string>;
}

export interface BootSpec {
  /** The command that starts the app; defaults to package.json `scripts.start`,
   *  then `node server.js`. PORT is injected so the app binds a free port. */
  command?: string;
  /** Install command for a dependency-having repo (default: npm ci / npm install).
   *  Skipped when the app declares no dependencies or node_modules already exists. */
  install?: string;
  /** Build command to run before boot (e.g. "next build"); skipped when empty. */
  build?: string;
  readyTimeoutMs?: number;
  prepareTimeoutMs?: number;
}

export interface RequestReproResult {
  reproduced: boolean; // did the request error (5xx)?
  status: number | null; // the HTTP status, or null if the app never answered
  signature: string | null; // the thrown error name, when detectable
  detail: string;
}

/** A free TCP port, so concurrent reproductions never collide. */
function freePort(): Promise<number> {
  return new Promise((done, reject) => {
    const srv = netCreateServer();
    srv.on("error", reject);
    srv.listen(0, () => {
      const addr = srv.address();
      const port = addr && typeof addr === "object" ? addr.port : 0;
      srv.close(() => done(port));
    });
  });
}

/** Resolve once the booting app accepts TCP connections, or false on timeout. */
async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const up = await new Promise<boolean>((res) => {
      const sock = netConnect(port, "127.0.0.1");
      sock.once("connect", () => {
        sock.destroy();
        res(true);
      });
      sock.once("error", () => {
        sock.destroy();
        res(false);
      });
    });
    if (up) return true;
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

/** The app's start command: package.json `scripts.start`, else the convention. */
async function startCommand(root: string): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
      scripts?: { start?: string };
    };
    if (pkg.scripts?.start) return pkg.scripts.start;
  } catch {
    /* fall through to the convention */
  }
  return "node server.js";
}

/** Does the repo declare any dependencies (so it needs an install before boot)? */
async function hasDependencies(root: string): Promise<boolean> {
  try {
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return (
      Object.keys(pkg.dependencies ?? {}).length > 0 ||
      Object.keys(pkg.devDependencies ?? {}).length > 0
    );
  } catch {
    return false;
  }
}

/** Run a shell command string (npm/pnpm/next/...) to completion. */
async function runShellCmd(root: string, command: string, timeoutMs: number): Promise<RunResult> {
  try {
    const { stdout, stderr } = await pexec(command, {
      cwd: root,
      shell: true,
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
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
 * Make a dependency-having repo bootable: install dependencies (when it declares
 * any and node_modules is absent) and run the build, if one is configured. A
 * no-op for a zero-dependency app (the bundled sample) or an already-installed
 * workspace. Returns ok:false (with a reason) so the gate escalates rather than
 * boot a half-prepared app.
 */
export async function prepareBoot(
  root: string,
  boot: BootSpec = {},
): Promise<{ ok: boolean; detail: string }> {
  const timeout = boot.prepareTimeoutMs ?? 300_000;

  const needsInstall =
    !(await exists(join(root, "node_modules"))) &&
    (boot.install != null || (await hasDependencies(root)));
  if (needsInstall) {
    const command =
      boot.install ??
      ((await exists(join(root, "package-lock.json"))) ? "npm ci" : "npm install");
    const r = await runShellCmd(root, command, timeout);
    if (r.code !== 0) return { ok: false, detail: `install failed (${command})` };
  }

  if (boot.build && boot.build.trim()) {
    const r = await runShellCmd(root, boot.build.trim(), timeout);
    if (r.code !== 0) return { ok: false, detail: `build failed (${boot.build.trim()})` };
  }

  return { ok: true, detail: "ready" };
}

/**
 * Tear down the booted app and everything it spawned. A shell-launched start
 * command (e.g. `next start`) sits under an intermediate shell, so we kill the
 * whole tree — taskkill /T on Windows, the process group on POSIX — then await
 * exit, since a live process keeps a handle on the workspace dir (Windows EBUSY).
 */
async function terminateTree(child: ChildProcess): Promise<void> {
  if (child.exitCode != null || child.signalCode != null || child.pid == null) return;
  const pid = child.pid;
  // Register the exit wait BEFORE issuing the kill so the event is never missed.
  const exited = new Promise<void>((res) => {
    child.once("exit", () => res());
    const cap = setTimeout(res, 3000); // never hang the gate on a stuck process
    cap.unref();
  });
  if (process.platform === "win32") {
    // Await taskkill so the whole tree is gone (and its dir handle released)
    // before we return; a lingering process is what causes EBUSY on cleanup.
    try {
      await pexec("taskkill", ["/pid", String(pid), "/T", "/F"]);
    } catch {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    }
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        /* already gone */
      }
    }
    const sigkill = setTimeout(() => {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }, 1200);
    sigkill.unref();
  }
  await exited;
}

/**
 * Boot the target app on a free port, replay the captured request, and report
 * whether it still errors. Installs deps / runs the build first (prepareBoot).
 * Fail-soft: if the app never boots we return reproduced:false with a detail, so
 * the gate escalates rather than trusting a reproduction that never ran. The app
 * process (and its tree) is always torn down.
 */
export async function reproduceRequest(
  root: string,
  req: RequestSpec,
  boot: BootSpec = {},
): Promise<RequestReproResult> {
  const prepared = await prepareBoot(root, boot);
  if (!prepared.ok) {
    return { reproduced: false, status: null, signature: null, detail: prepared.detail };
  }

  const port = await freePort();
  const command = (boot.command ?? (await startCommand(root))).trim();
  const [bin, ...args] = command.split(/\s+/);
  // `node X` runs directly (cleanest teardown); anything else (next/npm/pnpm) goes
  // through a shell so its launcher resolves. detached lets POSIX kill the group.
  const direct = bin === "node" || bin === "node.exe";
  const env = { ...process.env, PORT: String(port) };
  const child = direct
    ? spawn(bin, args, { cwd: root, env })
    : spawn(command, { cwd: root, env, shell: true, detached: process.platform !== "win32" });
  let log = "";
  child.stdout?.on("data", (d) => (log += String(d)));
  child.stderr?.on("data", (d) => (log += String(d)));
  child.on("error", () => {}); // a bad command surfaces as the boot timeout below

  try {
    if (!(await waitForPort(port, boot.readyTimeoutMs ?? 20_000))) {
      return { reproduced: false, status: null, signature: null, detail: "app did not boot" };
    }
    let status: number | null = null;
    try {
      const res = await fetch(`http://127.0.0.1:${port}${req.path}`, {
        method: req.method,
        headers: { "content-type": "application/json", ...(req.headers ?? {}) },
        body:
          req.body !== undefined && req.method.toUpperCase() !== "GET"
            ? JSON.stringify(req.body)
            : undefined,
      });
      status = res.status;
      await res.text().catch(() => "");
    } catch {
      // couldn't reach the booted app; treat as inconclusive (not reproduced)
    }
    await new Promise((r) => setTimeout(r, 120)); // let the server flush its error log
    const reproduced = status != null && status >= 500;
    const signature = reproduced ? (log.match(/(\w*Error)\b/)?.[1] ?? "Error") : null;
    return {
      reproduced,
      status,
      signature,
      detail: status == null ? "no response from app" : `HTTP ${status}`,
    };
  } finally {
    await terminateTree(child);
  }
}

/** Best-effort cleanup of a workspace. */
export async function destroyWorkspace(incidentId: string): Promise<void> {
  // Retry on Windows EBUSY/ENOTEMPTY: a just-exited child can briefly keep the dir handle.
  await rm(workspacePath(incidentId), { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
}
