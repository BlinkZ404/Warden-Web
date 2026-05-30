/**
 * Deploy adapter (PLAN §7, §8). Default path for the founder ICP: deploy a
 * preview, verify, and on approval promote to prod — with one-tap rollback.
 * Deploy credentials are NEVER exposed to the agents (§5.6): only this adapter
 * touches them.
 *
 * Simulation mode returns plausible Vercel-shaped identifiers/URLs and does no
 * network I/O; the REAL verification (tests + reproduction) runs against the
 * workspace, not the simulated URL. Live mode calls the Vercel API.
 */
import { config, live } from "@/lib/config";
import { httpError } from "@/lib/http";

export interface PreviewDeployment {
  provider: "vercel";
  deploymentId: string;
  previewUrl: string;
}

export interface Promotion {
  prodUrl: string;
  promotedAt: Date;
}

export interface ProdHealth {
  healthy: boolean;
  errorRateDelta: number; // fractional change vs baseline
  newErrors: string[];
  /** True when health could not be determined (vs. a real regression) → escalate, don't rollback. */
  unverifiable?: boolean;
}

function slug(incidentId: string): string {
  return incidentId.slice(0, 8);
}

export async function deployPreview(
  incidentId: string,
  opts: { ref?: string } = {},
): Promise<PreviewDeployment> {
  if (live.deploy()) {
    // Deploy the EXACT verified commit. The fix branch must be pushed to the
    // customer remote first so Vercel can build this SHA — see GO-LIVE.md
    // "deploy parity". Without VERCEL_REPO_ID this fails closed (rather than
    // silently building the wrong tree). Omitting `target` yields a preview.
    const res = await fetch(
      `https://api.vercel.com/v13/deployments${config.vercel.teamId ? `?teamId=${config.vercel.teamId}` : ""}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.vercel.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: config.vercel.projectId,
          gitSource: config.vercel.repoId
            ? { type: "github", repoId: config.vercel.repoId, ref: opts.ref }
            : undefined,
        }),
      },
    );
    if (!res.ok) await httpError("vercel deploy", res);
    const json = (await res.json()) as { id: string; url: string };
    return { provider: "vercel", deploymentId: json.id, previewUrl: `https://${json.url}` };
  }
  return {
    provider: "vercel",
    deploymentId: `dpl_sim_${slug(incidentId)}`,
    previewUrl: `https://checkout-service-${slug(incidentId)}-preview.vercel.app`,
  };
}

/** The current READY production deployment id — captured before promote so we can roll back TO it. */
export async function currentProdDeployment(): Promise<string | null> {
  if (!live.deploy()) return null;
  const res = await fetch(
    `https://api.vercel.com/v6/deployments?projectId=${config.vercel.projectId}&target=production&state=READY&limit=1${config.vercel.teamId ? `&teamId=${config.vercel.teamId}` : ""}`,
    { headers: { authorization: `Bearer ${config.vercel.token}` } },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { deployments?: { uid?: string; id?: string }[] };
  const d = json.deployments?.[0];
  return d?.uid ?? d?.id ?? null;
}

export async function promoteToProd(deploymentId: string): Promise<Promotion> {
  if (live.deploy()) {
    const res = await fetch(
      `https://api.vercel.com/v10/projects/${config.vercel.projectId}/promote/${deploymentId}${config.vercel.teamId ? `?teamId=${config.vercel.teamId}` : ""}`,
      { method: "POST", headers: { authorization: `Bearer ${config.vercel.token}` } },
    );
    if (!res.ok) await httpError("vercel promote", res);
  }
  return { prodUrl: "https://checkout-service.vercel.app", promotedAt: new Date() };
}

/**
 * Vercel instant rollback: re-points the production alias to `restoreToId` — the
 * PREVIOUS-good production deployment — with no rebuild (§7). It must NOT be the
 * just-shipped bad deployment. After a rollback, Vercel disables auto-promotion
 * until undone — the state machine tracks `rolled_back`.
 */
export async function rollback(restoreToId: string): Promise<void> {
  if (live.deploy()) {
    if (!restoreToId) throw new Error("rollback: no previous-good deployment to restore to");
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${config.vercel.projectId}/rollback/${restoreToId}${config.vercel.teamId ? `?teamId=${config.vercel.teamId}` : ""}`,
      { method: "POST", headers: { authorization: `Bearer ${config.vercel.token}` } },
    );
    if (!res.ok) await httpError("vercel rollback", res);
  }
  // sim: no-op (no real production alias to move)
}

/**
 * Watch production health after promotion (PLAN §9 verifying_prod, M9). Error
 * rate is a live signal (Sentry/Vercel analytics). In simulation we honor an
 * explicit "this scenario regresses in prod" directive. In live mode the real
 * comparison isn't implemented yet, so we fail CLOSED: report `unverifiable` so
 * the orchestrator escalates for human confirmation instead of auto-resolving
 * an unverified production state (see GO-LIVE.md).
 */
export async function verifyProdHealth(
  opts: { simulateRegression?: boolean } = {},
): Promise<ProdHealth> {
  if (live.deploy()) {
    return {
      healthy: false,
      unverifiable: true,
      errorRateDelta: 0,
      newErrors: ["prod health check not implemented — escalate for manual confirmation"],
    };
  }
  if (opts.simulateRegression) {
    return {
      healthy: false,
      errorRateDelta: 0.85,
      newErrors: ["ReferenceError: regression introduced by fix (simulated prod signal)"],
    };
  }
  return { healthy: true, errorRateDelta: 0, newErrors: [] };
}
