// Replays the exact production-failing request so verification can confirm the
// error has actually stopped — not just that tests pass.
//
// Two modes:
//   node scripts/reproduce.js <scenario> '<jsonInput>'        (named scenario)
//   node scripts/reproduce.js --call '<json:{module,export,args}>'  (generic)
//
// The generic `--call` mode is the live seam: given the culprit module + export
// (from the stack frame) and the positional args (from the captured request),
// it invokes the function directly — no hardcoded scenario needed. The named
// scenarios are kept for the seeded catalog.
//
// Exit 0 = the code path ran without throwing (error stopped).
// Exit 1 = it threw (error still reproduces).
import { computeCheckoutTotal } from "../src/checkout.js";
import { applyDiscount } from "../src/discount.js";

const [, , mode, payload] = process.argv;

function runScenario(scenario, input) {
  switch (scenario) {
    case "checkout-missing-price":
      return computeCheckoutTotal(input);
    case "discount-unknown-code":
      return applyDiscount(input.subtotal, input.code, input.codes);
    default:
      throw new Error(`unknown reproduction scenario: ${scenario}`);
  }
}

async function main() {
  if (mode === "--call") {
    // Generic: resolve the culprit module + export and call it with the
    // captured positional args. `module` is repo-relative (e.g. "src/checkout.js");
    // resolve it as a file:// URL so it works on every OS (no path.join backslashes).
    const { module: mod, export: exp, args } = JSON.parse(payload);
    const m = await import(new URL("../" + mod, import.meta.url));
    const fn = m[exp];
    if (typeof fn !== "function") {
      throw new Error(`reproduce: ${mod} has no callable export "${exp}"`);
    }
    // await even sync fns, in case a live culprit is async.
    return await fn(...(Array.isArray(args) ? args : []));
  }
  const input = payload ? JSON.parse(payload) : {};
  return runScenario(mode, input);
}

main()
  .then((result) => {
    console.log("OK " + JSON.stringify(result));
    process.exit(0);
  })
  .catch((e) => {
    const name = e && e.constructor ? e.constructor.name : "Error";
    console.error(`THREW ${name}: ${e && e.message ? e.message : e}`);
    process.exit(1);
  });
