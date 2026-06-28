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
  /**
   * Generic reproduction descriptor: the shape a live Sentry frame (the culprit
   * `export`) + captured request (the positional `args`) yields. When present,
   * the gate reproduces the error via reproduce.js `--call` mode instead of a
   * named scenario, exercising the engine that live incidents will use. In sim
   * it's sourced from this catalog; live, it is derived from the Sentry event.
   */
  repro?: { module: string; export: string; args: unknown[] };
  /**
   * Known-good inputs for the no-new-errors smoke battery (§5.3, AUDIT H4): the
   * culprit export is replayed on each after the fix, and any that now throw is a
   * regression the fix introduced. Only used alongside a generic `repro`
   * descriptor; these seeded inputs are the sim path, synthesized live.
   */
  smokeInputs?: unknown[];
  /** Turns correct code → buggy (production state). */
  inject: CodeEdit;
  /** Turns buggy code → fixed. */
  fix: CodeEdit;
  /**
   * An extra, unrelated edit the sim Fixer also applies; models a sloppy /
   * over-scoped patch. The Reviewer's real scope check flags the unrelated file,
   * and the orchestrator feeds that back for a tighter re-proposal (the
   * fix-iterate loop) rather than escalating on the first objection.
   */
  sloppyFix?: CodeEdit;
  /**
   * If set, the over-scoped `sloppyFix` is re-applied even on a revision, so the
   * fix-iterate loop never converges and escalates after MAX_FIX_ATTEMPTS;
   * exercises the bounded-autonomy guarantee.
   */
  stubbornSloppy?: boolean;
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

// The basket that triggers the checkout TypeError (a FREE-GIFT line with no
// `price`). Shared by the named-scenario input and the generic `repro` args so
// the two cannot drift.
const CHECKOUT_CRASH_CART = {
  taxRate: 0.1,
  items: [
    { sku: "MUG", price: { amount: 1000 }, quantity: 1 },
    { sku: "FREE-GIFT", quantity: 1 },
  ],
};

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
      "Treat line items with no price (e.g. free gifts) as costing 0 instead of crashing the checkout. Pricing stays the same; only the crash is removed.",
    reproScenario: "checkout-missing-price",
    triggeringInput: CHECKOUT_CRASH_CART,
    // Generic-path descriptor (the live seam). `args` is always a positional
    // argument list; the cart is one object, so it's wrapped: [cart].
    repro: {
      module: "src/checkout.js",
      export: "computeCheckoutTotal",
      args: [CHECKOUT_CRASH_CART],
    },
    smokeInputs: [
      { taxRate: 0.08, items: [{ sku: "TEE", price: { amount: 2000 }, quantity: 2 }] },
      {
        taxRate: 0,
        items: [
          { sku: "PEN", price: { amount: 150 }, quantity: 1 },
          { sku: "PAD", price: { amount: 450 }, quantity: 3 },
        ],
      },
    ],
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
    // Same root cause as the checkout bug, but the simulated Fixer's first patch
    // is over-scoped (it also edits an unrelated file). Used to demonstrate the
    // Reviewer catching it and the bounded retry loop re-proposing a tighter fix
    // that ships, rather than escalating.
    key: "checkout-missing-price-risky",
    fingerprint: "checkout-service/computeCheckoutTotal/TypeError-amount-risky",
    title: "TypeError in checkout (risky-fix scenario)",
    service: "checkout-service",
    severity: "error",
    errorType: "TypeError",
    errorMessage: "Cannot read properties of undefined (reading 'amount')",
    culpritFile: "src/checkout.js",
    rootCause:
      "Same as the base checkout TypeError: computeCheckoutTotal reads `.amount` off a cart line that can be missing a price.",
    fixSummary:
      "Guard missing prices (but the patch also touches an unrelated file, which the Reviewer flags).",
    reproScenario: "checkout-missing-price",
    triggeringInput: CHECKOUT_CRASH_CART,
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
    // approved, but production error rate spikes after promotion, exercising
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
    triggeringInput: CHECKOUT_CRASH_CART,
    inject: { file: "src/checkout.js", find: CHECKOUT_GOOD, replace: CHECKOUT_BAD },
    fix: { file: "src/checkout.js", find: CHECKOUT_BAD, replace: CHECKOUT_GOOD },
    simProdRegresses: true,
  },
  {
    // Bounded autonomy: the Fixer keeps over-scoping the patch (the unrelated
    // file comes back on every revision), so after MAX_FIX_ATTEMPTS Warden
    // escalates to a human instead of looping forever or shipping it.
    key: "checkout-stubborn-scope",
    fingerprint: "checkout-service/computeCheckoutTotal/TypeError-amount-stubborn",
    title: "TypeError in checkout (won't-tighten scenario)",
    service: "checkout-service",
    severity: "error",
    errorType: "TypeError",
    errorMessage: "Cannot read properties of undefined (reading 'amount')",
    culpritFile: "src/checkout.js",
    rootCause:
      "Same as the checkout TypeError, used to exercise bounded autonomy: the fix keeps over-scoping, so Warden escalates to a human after a few tries rather than looping forever.",
    fixSummary: "Guard missing prices (the patch keeps touching an unrelated file across revisions).",
    reproScenario: "checkout-missing-price",
    triggeringInput: CHECKOUT_CRASH_CART,
    inject: { file: "src/checkout.js", find: CHECKOUT_GOOD, replace: CHECKOUT_BAD },
    fix: { file: "src/checkout.js", find: CHECKOUT_BAD, replace: CHECKOUT_GOOD },
    sloppyFix: {
      file: "server.js",
      find: "const port = Number(process.env.PORT) || 3100;",
      replace:
        "const port = Number(process.env.PORT) || 3100; // TODO: unrelated drive-by change",
    },
    stubbornSloppy: true,
  },
  {
    // Sensitive-path scenario: the fix lands on an auth module, so Warden fixes
    // and verifies it but routes it to a human for approval rather than
    // auto-shipping (the require-approval policy for protected paths).
    key: "signin-email-typo",
    fingerprint: "notehex/normalizeEmail/TypeError-toLowerCasee",
    title: "TypeError in sign-in: email.trim(...).toLowerCasee is not a function",
    service: "notehex",
    severity: "error",
    errorType: "TypeError",
    errorMessage: "email.trim(...).toLowerCasee is not a function",
    culpritFile: "src/auth.js",
    rootCause:
      "normalizeEmail lowercases the address with `toLowerCasee()`, a typo for the built-in `toLowerCase()`. Since `toLowerCasee` is not a String method, every sign-in throws a TypeError. The fix is one character, but the file is an auth module, so Warden verifies it and asks a human to approve before shipping.",
    fixSummary:
      "Fix the typo in the sign-in email cleanup (toLowerCasee to toLowerCase) so logins stop crashing. Because it touches auth code, the verified fix waits for your approval before it ships.",
    reproScenario: "signin-email-typo",
    triggeringInput: "Founder@Example.com",
    repro: {
      module: "src/auth.js",
      export: "normalizeEmail",
      args: ["Founder@Example.com"],
    },
    smokeInputs: ["a@b.com", "Test.User@Domain.CO"],
    inject: { file: "src/auth.js", find: "email.trim().toLowerCase()", replace: "email.trim().toLowerCasee()" },
    fix: { file: "src/auth.js", find: "email.trim().toLowerCasee()", replace: "email.trim().toLowerCase()" },
  },
];

export function getBugByKey(key: string): SeededBug | undefined {
  return SEEDED_BUGS.find((b) => b.key === key);
}

export function getBugByFingerprint(fp: string): SeededBug | undefined {
  return SEEDED_BUGS.find((b) => b.fingerprint === fp);
}
