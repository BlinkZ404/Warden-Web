/**
 * Clone (or refresh) the linked GitHub repo into the local cache so the pipeline
 * can target the operator's real code. Reads the saved TARGET_REPO_URL +
 * GITHUB_TOKEN, so save those first.
 */
import { hydrateSettings } from "@/lib/runtime-config";
import { checkApiSecret } from "@/lib/auth/api-auth";
import { pullTargetRepo } from "@/lib/adapters/github-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  await hydrateSettings();
  const denied = checkApiSecret(req);
  if (denied) return denied;
  try {
    const status = await pullTargetRepo();
    return Response.json({ ok: true, ...status });
  } catch (e) {
    const error = e instanceof Error ? e.message : "pull failed";
    return Response.json({ ok: false, error }, { status: 400 });
  }
}
