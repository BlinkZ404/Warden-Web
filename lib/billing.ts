/**
 * Managed-inference billing seam.
 *
 * In "managed" mode Warden runs inference on the customer's behalf and meters each run
 * against the prepaid wallet at the selected model's published rate. In "byok"
 * mode the customer brought their own provider keys and is billed by the
 * provider directly, so Warden meters nothing. The mode is a saved setting so
 * the dashboard can flip it without a redeploy.
 */
import { setting } from "@/lib/runtime-config";
import { parseAssignment, labelForModelId } from "@/lib/models";
import { runRateUsd } from "@/lib/pricing";
import { getBalance, debit } from "@/lib/repo/wallet";

export type BillingMode = "managed" | "byok";

export function billingMode(): BillingMode {
  return setting("BILLING_MODE", "managed") === "byok" ? "byok" : "managed";
}

/**
 * Meter one agent run. Resolve the rate from a role's assigned model
 * (`roleKey`), or directly from a model name (`model`, used for panel reviewers
 * whose model is their agent name). No-op in byok mode. Best-effort: a billing
 * hiccup must never fail the pipeline, so debits are swallowed on error.
 */
export async function meterRun(
  incidentId: string,
  opts: { roleKey?: string; model?: string },
): Promise<void> {
  if (billingMode() !== "managed") return;
  let rate: number;
  let label: string;
  if (opts.roleKey) {
    const a = parseAssignment(setting(opts.roleKey));
    rate = runRateUsd(a?.id);
    label = labelForModelId(a?.id ?? "") || a?.label || "managed";
  } else {
    // Panel reviewer names can carry a "#2" suffix; strip it before pricing and
    // show the friendly model name in the ledger, not the raw "lab/model#n" slug.
    const id = (opts.model ?? "").replace(/\s*#\d+$/, "");
    rate = runRateUsd(id);
    label = labelForModelId(id) || opts.model || "managed";
  }
  if (rate <= 0) return;
  try {
    await debit(rate, { incidentId, model: label, description: opts.roleKey ?? "agent run" });
  } catch {
    /* metering is non-critical; the run already happened */
  }
}

/** True when managed mode is on and the wallet is empty; new work must wait
 *  for a top-up rather than running on credit we don't have. */
export async function insufficientBalance(): Promise<boolean> {
  if (billingMode() !== "managed") return false;
  return (await getBalance()) <= 0;
}
