/**
 * Link a real GitHub repo and pull it locally.
 *
 * The per-incident workspace (lib/adapters/workspace.ts) materializes its copy
 * from a *source* directory. By default that source is the bundled `./sample-app`;
 * when an operator links a repo (TARGET_REPO_URL + the GITHUB_TOKEN from the
 * GitHub connect/OAuth), this module clones it into a cached checkout and the
 * pipeline targets that instead — so Warden investigates and fixes the real code.
 *
 * The clone is shallow and cached under `.warden/repos/<owner>-<name>`; the token
 * is used for the fetch and then stripped from the persisted remote config.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rm, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { config } from "@/lib/config";
import { setting } from "@/lib/runtime-config";
import { OAUTH_PROVIDERS } from "@/lib/auth/oauth-providers";

const pexec = promisify(execFile);
const REPOS_ROOT = resolve(process.cwd(), ".warden", "repos");
const GIT_OPTS = { maxBuffer: 32 * 1024 * 1024, timeout: 120_000 } as const;

export interface RepoRef {
  owner: string;
  name: string;
  slug: string;
}

export interface RepoStatus {
  repo: string;
  branch: string;
  head: string;
  files: number;
  private: boolean;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Accepts `owner/name`, a github URL, or an ssh ref; null if unparseable. */
export function parseRepo(input: string): RepoRef | null {
  const s = input.trim().replace(/\.git$/i, "");
  const m = s.match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)$/);
  if (!m) return null;
  const [, owner, name] = m;
  return { owner, name, slug: `${owner}-${name}`.replace(/[^\w.-]/g, "_") };
}

/** The linked repo, or "" when none is configured (use the bundled sample app). */
export function targetRepoUrl(): string {
  return setting("TARGET_REPO_URL").trim();
}

export function authedUrl(ref: RepoRef, token: string): string {
  const auth = token ? `x-access-token:${encodeURIComponent(token)}@` : "";
  return `https://${auth}github.com/${ref.owner}/${ref.name}.git`;
}

function cleanUrl(ref: RepoRef): string {
  return `https://github.com/${ref.owner}/${ref.name}.git`;
}

function cacheDir(ref: RepoRef): string {
  return join(REPOS_ROOT, ref.slug);
}

async function git(args: string[]): Promise<string> {
  const { stdout } = await pexec("git", args, GIT_OPTS);
  return stdout.trim();
}

let inflightPull: Promise<RepoStatus> | null = null;

/**
 * Clone the linked repo into the cache (or hard-refresh it if already cloned),
 * then return its status. Throws a readable error on a bad repo/token.
 *
 * Concurrent callers (e.g. two incidents that both find the cache missing, or a
 * manual pull racing a pipeline) are coalesced onto a single clone.
 */
export function pullTargetRepo(): Promise<RepoStatus> {
  if (!inflightPull) {
    inflightPull = doPull().finally(() => {
      inflightPull = null;
    });
  }
  return inflightPull;
}

async function doPull(): Promise<RepoStatus> {
  const url = targetRepoUrl();
  const ref = url ? parseRepo(url) : null;
  if (!ref) throw new Error("Set a GitHub repo (owner/name) to link first.");
  const token = setting(OAUTH_PROVIDERS.github.tokenKey);
  const dir = cacheDir(ref);
  await mkdir(REPOS_ROOT, { recursive: true });

  try {
    if (await exists(join(dir, ".git"))) {
      await git(["-C", dir, "remote", "set-url", "origin", authedUrl(ref, token)]);
      await git(["-C", dir, "fetch", "--depth", "1", "origin", "HEAD"]);
      await git(["-C", dir, "reset", "--hard", "FETCH_HEAD"]);
    } else {
      await rm(dir, { recursive: true, force: true });
      await git(["clone", "--depth", "1", authedUrl(ref, token), dir]);
    }
    // Never persist the token in the cached repo's git config.
    await git(["-C", dir, "remote", "set-url", "origin", cleanUrl(ref)]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Don't leak the token if it appeared in an error message.
    throw new Error(`git pull failed: ${msg.replace(/x-access-token:[^@]*@/g, "***@")}`);
  }

  const branch = await git(["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"]);
  const head = await git(["-C", dir, "rev-parse", "--short", "HEAD"]);
  const list = await git(["-C", dir, "ls-files"]);
  return {
    repo: `${ref.owner}/${ref.name}`,
    branch,
    head,
    files: list ? list.split("\n").filter(Boolean).length : 0,
    private: !!token,
  };
}

/**
 * The directory the workspace should copy from: the cached clone of the linked
 * repo (cloning it on first use), or the bundled sample app when none is linked.
 */
export async function ensureTargetRepo(): Promise<string> {
  const url = targetRepoUrl();
  const ref = url ? parseRepo(url) : null;
  if (!ref) return resolve(process.cwd(), config.targetRepoPath);
  const dir = cacheDir(ref);
  if (!(await exists(join(dir, ".git")))) await pullTargetRepo();
  return dir;
}
