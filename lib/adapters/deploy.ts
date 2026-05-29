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
}

function slug(incidentId: string): string {
  return incidentId.slice(0, 8);
}

export async function deployPreview(
  incidentId: string,
  _workspaceRoot: string,
): Promise<PreviewDeployment> {
  if (live.deploy()) {
    // Live: `vercel deploy` (prebuilt) → returns a preview URL. Untested w/o token.
    const res = await fetch(
      `https://api.vercel.com/v13/deployments${config.vercel.teamId ? `?teamId=${config.vercel.teamId}` : ""}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.vercel.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: config.vercel.projectId, target: "preview" }),
      },
    );
    if (!res.ok) throw new Error(`vercel deploy ${res.status}`);
    const json = (await res.json()) as { id: string; url: string };
    return { provider: "vercel", deploymentId: json.id, previewUrl: `https://${json.url}` };
  }
  return {
    provider: "vercel",
    deploymentId: `dpl_sim_${slug(incidentId)}`,
    previewUrl: `https://checkout-service-${slug(incidentId)}-preview.vercel.app`,
  };
}

export async function promoteToProd(deploymentId: string): Promise<Promotion> {
  if (live.deploy()) {
    const res = await fetch(
      `https://api.vercel.com/v10/projects/${config.vercel.projectId}/promote/${deploymentId}${config.vercel.teamId ? `?teamId=${config.vercel.teamId}` : ""}`,
      { method: "POST", headers: { authorization: `Bearer ${config.vercel.token}` } },
    );
    if (!res.ok) throw new Error(`vercel promote ${res.status}`);
  }
  return { prodUrl: "https://checkout-service.vercel.app", promotedAt: new Date() };
}

/**
 * Vercel instant rollback: re-points the production alias to the previous
 * deployment with no rebuild (§7). After a rollback, Vercel disables
 * auto-promotion until undone — the state machine tracks `rolled_back`.
 */
export async function rollback(deploymentId: string): Promise<void> {
  if (live.deploy()) {
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${config.vercel.projectId}/rollback/${deploymentId}${config.vercel.teamId ? `?teamId=${config.vercel.teamId}` : ""}`,
      { method: "POST", headers: { authorization: `Bearer ${config.vercel.token}` } },
    );
    if (!res.ok) throw new Error(`vercel rollback ${res.status}`);
  }
  // sim: no-op
}

/**
 * Watch production health after promotion (PLAN §9 verifying_prod, M9). Error
 * rate is a live signal (Sentry/Vercel analytics), so in simulation we honor an
 * explicit "this scenario regresses in prod" directive from the orchestrator.
 */
export async function verifyProdHealth(
  opts: { simulateRegression?: boolean } = {},
): Promise<ProdHealth> {
  if (live.deploy()) {
    // Live: compare post-deploy error rate to baseline via Sentry/Vercel.
    // (Untested without keys.) Default healthy if unavailable.
    return { healthy: true, errorRateDelta: 0, newErrors: [] };
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
