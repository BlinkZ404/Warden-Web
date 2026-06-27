/**
 * Deliver an approved, verified fix into the linked GitHub repo: push the fix
 * branch, open a PR (carrying the incident summary + verification results), and
 * — in "merge" mode — merge it so the team's existing CI/CD ships it ("fix
 * ASAP"). Warden holds no deploy credentials on this path; it rides the repo's
 * own pipeline, and the verified fix is the deliverable.
 *
 * A clean PR requires the per-incident workspace to share the linked repo's git
 * history (see the GitHub-mode branch in lib/adapters/workspace.ts).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setting } from "@/lib/runtime-config";
import { OAUTH_PROVIDERS } from "@/lib/auth/oauth-providers";
import { parseRepo, targetRepoUrl, authedUrl, type RepoRef } from "@/lib/adapters/github-repo";

const pexec = promisify(execFile);
const GIT_OPTS = { maxBuffer: 32 * 1024 * 1024, timeout: 120_000 } as const;
const API = "https://api.github.com";

export interface DeliverInput {
  workspaceRoot: string; // the per-incident workspace holding the fix branch
  branch: string; // the fix branch, e.g. warden/fix-<id>
  base: string; // base branch to target (the repo default)
  title: string;
  body: string;
  merge?: boolean; // "merge" mode: merge the PR after opening it
}

export interface DeliverResult {
  repo: string;
  prNumber: number;
  prUrl: string;
  merged: boolean;
}

interface PrData {
  number: number;
  html_url: string;
}
interface ApiError {
  message?: string;
}

function requireToken(): string {
  const t = setting(OAUTH_PROVIDERS.github.tokenKey);
  if (!t) throw new Error("Connect GitHub (a repo-scoped token) to open a PR.");
  return t;
}

function requireRepo(): RepoRef {
  const ref = parseRepo(targetRepoUrl());
  if (!ref) throw new Error("Link a GitHub repo (owner/name) first.");
  return ref;
}

async function gh<T>(
  path: string,
  init: RequestInit,
  token: string,
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

/** Push the fix branch and open (and optionally merge) a PR on the linked repo. */
export async function deliverFix(input: DeliverInput): Promise<DeliverResult> {
  const ref = requireRepo();
  const token = requireToken();
  const repo = `${ref.owner}/${ref.name}`;

  // 1) Push the fix branch to the remote (force-with-lease keeps retries safe).
  try {
    await pexec(
      "git",
      [
        "-C",
        input.workspaceRoot,
        "push",
        "--force-with-lease",
        authedUrl(ref, token),
        `${input.branch}:${input.branch}`,
      ],
      GIT_OPTS,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`git push failed: ${msg.replace(/x-access-token:[^@]*@/g, "***@")}`);
  }

  // 2) Open the PR, or reuse the open one for this branch.
  let pr = await gh<PrData & ApiError>(
    `/repos/${repo}/pulls`,
    {
      method: "POST",
      body: JSON.stringify({ title: input.title, head: input.branch, base: input.base, body: input.body }),
    },
    token,
  );
  if (!pr.ok && pr.status === 422) {
    const existing = await gh<PrData[]>(
      `/repos/${repo}/pulls?head=${ref.owner}:${input.branch}&state=open`,
      { method: "GET" },
      token,
    );
    if (existing.ok && Array.isArray(existing.data) && existing.data[0]) {
      pr = { ok: true, status: 200, data: existing.data[0] };
    }
  }
  if (!pr.ok) {
    throw new Error(`opening PR failed (${pr.status}): ${pr.data.message ?? "unknown error"}`);
  }
  const prNumber = pr.data.number;
  const prUrl = pr.data.html_url;

  // 3) Merge if asked (the "fix ASAP" path; the team's CI/CD takes over).
  let merged = false;
  if (input.merge) {
    const m = await gh<{ merged?: boolean } & ApiError>(
      `/repos/${repo}/pulls/${prNumber}/merge`,
      { method: "PUT", body: JSON.stringify({ merge_method: "squash" }) },
      token,
    );
    if (!m.ok) throw new Error(`merge failed (${m.status}): ${m.data.message ?? "unknown error"}`);
    merged = !!m.data.merged;
  }

  return { repo, prNumber, prUrl, merged };
}

/** Merge an already-open PR by number (squash). Powers the dashboard's "Merge"
 *  action on a fix Warden delivered as a PR. */
export async function mergePr(prNumber: number): Promise<{ merged: boolean }> {
  const ref = requireRepo();
  const token = requireToken();
  const repo = `${ref.owner}/${ref.name}`;
  const m = await gh<{ merged?: boolean } & ApiError>(
    `/repos/${repo}/pulls/${prNumber}/merge`,
    { method: "PUT", body: JSON.stringify({ merge_method: "squash" }) },
    token,
  );
  if (!m.ok) throw new Error(`merge failed (${m.status}): ${m.data.message ?? "unknown error"}`);
  return { merged: !!m.data.merged };
}
