/**
 * List the connected GitHub account's repositories for the Settings repo picker.
 *
 * Uses the stored GITHUB_TOKEN (from the OAuth connect, or a pasted token). Returns
 * an empty list when no token is set or the call fails, so the UI falls back to
 * manual owner/name entry.
 */
import { hydrateSettings, setting } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GHRepo {
  full_name: string;
  private: boolean;
}

export async function GET() {
  await hydrateSettings();
  const token = setting("GITHUB_TOKEN");
  if (!token) return Response.json({ repos: [] });
  try {
    const res = await fetch(
      "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,organization_member,collaborator",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!res.ok) return Response.json({ repos: [] });
    const data = (await res.json()) as GHRepo[];
    // Keep GitHub's recently-updated order so the repo you're working on is near
    // the top; just trim to the fields the picker needs.
    const repos = data.map((r) => ({ full_name: r.full_name, private: r.private }));
    return Response.json({ repos });
  } catch {
    return Response.json({ repos: [] });
  }
}
