/**
 * Catalog of injectable bugs for simulation mode.
 *
 * Each entry is a *real* pair of code edits against the sample app:
 *   - `inject`: turns the correct code into the production-buggy code. The sim
 *     Sentry source applies this to the per-incident workspace so the error
 *     genuinely reproduces.
 *   - `fix`: the patch the sim Fixer applies to repair it. Applying `fix` after
 *     `inject` restores correct code, so the verification gate (tests + repro)
 *     genuinely passes only when the fix is real.
 *
 * In LIVE mode none of this is used: the real Sentry webhook supplies the error
 * and Claude writes the patch. This registry is the offline stand-in for both.
 */

export interface CodeEdit {
  file: string; // path relative to the target repo root
  find: string;
  replace: string;
}

export interface SeededBug {
  key: string;
  fingerprint: string;
  title: string;
  service: string;
  severity: string;
  errorType: string;
  errorMessage: string;
  culpritFile: string;
  /** Plain-English root cause the sim investigation produces. */
  rootCause: string;
  /** Plain-English summary the sim Fixer attaches to the fix (for the founder). */
  fixSummary: string;
  /** Reproduction scenario understood by sample-app/scripts/reproduce.js. */
  reproScenario: string;
  /** Input that reproduces the crash. */
  triggeringInput: unknown;
  /** Turns correct code → buggy (production state). */
  inject: CodeEdit;
  /** Turns buggy code → fixed. */
  fix: CodeEdit;
  /**
   * An extra, unrelated edit the sim Fixer also applies — used to model a
   * sloppy / over-scoped patch. The Reviewer's real scope check then flags an
   * unrelated file and the incident escalates instead of auto-handling
   * (PLAN §5.4, §10: surface disagreement as escalation).
   */
  sloppyFix?: CodeEdit;
  /**
   * If set, the fix passes preview verification but production health degrades
   * after promotion (a spike only visible in prod), triggering auto-rollback
   * (PLAN §9 rolled_back, M9, §16). Error-rate monitoring is inherently a live
   * signal, so this is simulated.
   */
  simProdRegresses?: boolean;
}

const CHECKOUT_GOOD =
  "    const unit = item.price?.amount ?? 0;\n    subtotal += unit * item.quantity;";
const CHECKOUT_BAD = "    subtotal += item.price.amount * item.quantity;";

const DISCOUNT_GOOD =
  "  const rule = codes[code];\n  if (!rule) return subtotal; // unknown / empty code → charge full price\n  return Math.round(subtotal * (1 - rule.percent / 100));";
const DISCOUNT_BAD =
  "  return Math.round(subtotal * (1 - codes[code].percent / 100));";

export const SEEDED_BUGS: SeededBug[] = [
  {
    key: "checkout-missing-price",
    fingerprint: "checkout-service/computeCheckoutTotal/TypeError-amount",
    title: "TypeError in checkout: cannot read 'amount' of undefined",
    service: "checkout-service",
    severity: "error",
    errorType: "TypeError",
    errorMessage: "Cannot read properties of undefined (reading 'amount')",
    culpritFile: "src/checkout.js",
    rootCause:
      "computeCheckoutTotal assumes every line item has a populated `price` object, but promo / free-gift items come through with `price` omitted. Reading `item.price.amount` on those items throws a TypeError and crashes the whole basket.",
    fixSummary:
      "Treat line items with no price (e.g. free gifts) as costing 0 instead of crashing the checkout. No price is ever charged differently — only the crash is removed.",
    reproScenario: "checkout-missing-price",
    triggeringInput: {
      taxRate: 0.1,
      items: [
        { sku: "MUG", price: { amount: 1000 }, quantity: 1 },
        { sku: "FREE-GIFT", quantity: 1 },
      ],
    },
    inject: { file: "src/checkout.js", find: CHECKOUT_GOOD, replace: CHECKOUT_BAD },
    fix: { file: "src/checkout.js", find: CHECKOUT_BAD, replace: CHECKOUT_GOOD },
  },
  {
    key: "discount-unknown-code",
    fingerprint: "checkout-service/applyDiscount/TypeError-percent",
    title: "TypeError in discount: cannot read 'percent' of undefined",
    service: "checkout-service",
    severity: "error",
    errorType: "TypeError",
    errorMessage: "Cannot read properties of undefined (reading 'percent')",
    culpritFile: "src/discount.js",
    rootCause:
      "applyDiscount looks up `codes[code].percent` without checking the code exists. A mistyped or expired coupon code yields `undefined`, and reading `.percent` on it throws, failing the checkout request.",
    fixSummary:
      "When a discount code isn't recognised, charge full price instead of crashing. Valid codes are unaffected.",
    reproScenario: "discount-unknown-code",
    triggeringInput: { subtotal: 1000, code: "BOGUS50" },
    inject: { file: "src/discount.js", find: DISCOUNT_GOOD, replace: DISCOUNT_BAD },
    fix: { file: "src/discount.js", find: DISCOUNT_BAD, replace: DISCOUNT_GOOD },
  },
  {
    // Same root cause as the checkout bug, but the simulated Fixer produces an
    // over-scoped patch (also edits an unrelated file). Used to demonstrate the
    // Reviewer catching it and the incident escalating rather than shipping.
    key: "checkout-missing-price-risky",
    fingerprint: "checkout-service/computeCheckoutTotal/TypeError-amount-risky",
    title: "TypeError in checkout (risky-fix scenario)",
    service: "checkout-service",
    severity: "error",
    errorType: "TypeError",
    errorMessage: "Cannot read properties of undefined (reading 'amount')",
    culpritFile: "src/checkout.js",
    rootCause:
      "Same as the checkout TypeError, used to exercise the disagreement → escalation path when a fix is over-scoped.",
    fixSummary:
      "Guard missing prices (but the patch also touches an unrelated file, which the Reviewer flags).",
    reproScenario: "checkout-missing-price",
    triggeringInput: {
      taxRate: 0.1,
      items: [
        { sku: "MUG", price: { amount: 1000 }, quantity: 1 },
        { sku: "FREE-GIFT", quantity: 1 },
      ],
    },
    inject: { file: "src/checkout.js", find: CHECKOUT_GOOD, replace: CHECKOUT_BAD },
    fix: { file: "src/checkout.js", find: CHECKOUT_BAD, replace: CHECKOUT_GOOD },
    sloppyFix: {
      file: "server.js",
      find: "const port = Number(process.env.PORT) || 3100;",
      replace:
        "const port = Number(process.env.PORT) || 3100; // TODO: unrelated drive-by change",
    },
  },
  {
    // Clean, tightly-scoped fix that passes preview verification and is
    // approved — but production error rate spikes after promotion, exercising
    // the auto-rollback path.
    key: "checkout-prod-regression",
    fingerprint: "checkout-service/computeCheckoutTotal/TypeError-amount-prodreg",
    title: "TypeError in checkout (prod-regression scenario)",
    service: "checkout-service",
    severity: "error",
    errorType: "TypeError",
    errorMessage: "Cannot read properties of undefined (reading 'amount')",
    culpritFile: "src/checkout.js",
    rootCause:
      "Same as the checkout TypeError, used to exercise the auto-rollback path when production health degrades after promotion.",
    fixSummary: "Guard missing prices on checkout line items.",
    reproScenario: "checkout-missing-price",
    triggeringInput: {
      taxRate: 0.1,
      items: [
        { sku: "MUG", price: { amount: 1000 }, quantity: 1 },
        { sku: "FREE-GIFT", quantity: 1 },
      ],
    },
    inject: { file: "src/checkout.js", find: CHECKOUT_GOOD, replace: CHECKOUT_BAD },
    fix: { file: "src/checkout.js", find: CHECKOUT_BAD, replace: CHECKOUT_GOOD },
    simProdRegresses: true,
  },
];

export function getBugByKey(key: string): SeededBug | undefined {
  return SEEDED_BUGS.find((b) => b.key === key);
}

export function getBugByFingerprint(fp: string): SeededBug | undefined {
  return SEEDED_BUGS.find((b) => b.fingerprint === fp);
}
