/**
 * Pricing + ROI model (client-safe constants, no server deps).
 *
 * Every figure here is a MODELLED assumption surfaced in the UI, not a metered
 * charge or a measured outage cost. The dashboard shows the basis next to each
 * number so it reads as an estimate, not a bill.
 */

/** Nominal modelled cost per agent run (one logged model invocation). */
export const RATE_PER_RUN_USD = 0.018;

/** Baseline time a solo founder would take to triage + fix a prod bug by hand. */
export const BASELINE_MTTR_MIN = 90;

/** Modelled cost of one outage minute for a small business (USD/min). */
export const DOWNTIME_USD_PER_MIN = 150;

/** Fully-loaded engineer cost (USD/hour). */
export const ENG_HOURLY_USD = 110;

export interface RoiModel {
 downtimeAvoidedUsd: number;
 hoursReclaimed: number;
 laborSavedUsd: number;
 valueDeliveredUsd: number;
}

/**
 * Derive the ROI figures from the fleet counts. `resolved` incidents are the
 * ones Warden carried to a verified, shipped fix; `timeToVerifiedSec` is the
 * mean detection→verified latency.
 */
export function computeRoi(resolved: number, timeToVerifiedSec: number | null): RoiModel {
 const verifiedMin = (timeToVerifiedSec ?? 0) / 60;
 const minutesSaved = Math.max(0, BASELINE_MTTR_MIN - verifiedMin);
 const downtimeAvoidedUsd = resolved * minutesSaved * DOWNTIME_USD_PER_MIN;
 const hoursReclaimed = (resolved * BASELINE_MTTR_MIN) / 60;
 const laborSavedUsd = hoursReclaimed * ENG_HOURLY_USD;
 return {
 downtimeAvoidedUsd,
 hoursReclaimed,
 laborSavedUsd,
 valueDeliveredUsd: downtimeAvoidedUsd + laborSavedUsd,
 };
}

/**
 * Managed-inference billing. Warden runs the models on its own infrastructure
 * (routed through a single gateway) so the customer never pastes a provider key.
 * Each agent run is metered against a prepaid USD balance at the selected model's
 * published rate; the rate already includes Warden's margin over raw token cost.
 * A customer keeps a balance topped up the way they would fund any API account.
 */

/** Free credit a new wallet starts with, so the first incidents run with no setup. */
export const STARTING_BALANCE_USD = 25;

/** Balance below which the billing panel nudges a top-up. */
export const LOW_BALANCE_USD = 5;

/** Per-run price when a role has no specific model assigned (the managed default). */
export const DEFAULT_RUN_RATE_USD = 0.02;

/** Suggested top-up amounts shown on the billing panel. */
export const TOPUP_OPTIONS_USD = [10, 25, 50, 100];

/**
 * Published managed price for one agent run of a given model, in USD. Tiered by
 * the model's class (frontier / standard / fast) so picking a cheaper model
 * visibly lowers the per-run cost. Margin over raw token cost is baked in here.
 */
export function runRateUsd(modelId?: string | null): number {
 if (!modelId) return DEFAULT_RUN_RATE_USD;
 const id = modelId.toLowerCase();
 // Fast / small markers win first, so e.g. a "nano…reasoning" id isn't read as
 // frontier. Anchored to segment boundaries so "geMINI"/"MINImax" don't match "mini".
 if (/(^|[-/\s])(haiku|mini|flash|lite|air|nano|fast)([-/\s.]|$)/.test(id)) return 0.006;
 // Frontier markers; "non-reasoning" must not count as reasoning.
 const reasoning = /reasoning/.test(id) && !/non-?reasoning/.test(id);
 if (/opus|ultra|super|pro/.test(id) || reasoning) return 0.04;
 return DEFAULT_RUN_RATE_USD; // standard
}

/** Compact USD: `$1,840` for large figures, `$0.18` for small ones. */
export function usd(n: number): string {
 if (n >= 1000) return `$${Math.round(n).toLocaleString("en-US")}`;
 if (n >= 10) return `$${Math.round(n)}`;
 return `$${n.toFixed(2)}`;
}

/** USD that always shows cents — for the wallet, where small per-run debits must
 *  stay visible (a $24.68 balance must not round to "$25"). */
export function usdc(n: number): string {
 return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
