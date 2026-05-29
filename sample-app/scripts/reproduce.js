// Replays the exact production-failing request so verification can confirm the
// error has actually stopped — not just that tests pass.
//
//   node scripts/reproduce.js <scenario> '<jsonInput>'
//
// Exit 0 = the code path ran without throwing (error stopped).
// Exit 1 = it threw (error still reproduces).
import { computeCheckoutTotal } from "../src/checkout.js";
import { applyDiscount } from "../src/discount.js";

const [, , scenario, inputJson] = process.argv;
const input = inputJson ? JSON.parse(inputJson) : {};

function run() {
  switch (scenario) {
    case "checkout-missing-price":
      return computeCheckoutTotal(input);
    case "discount-unknown-code":
      return applyDiscount(input.subtotal, input.code, input.codes);
    default:
      throw new Error(`unknown reproduction scenario: ${scenario}`);
  }
}

try {
  const result = run();
  console.log("OK " + JSON.stringify(result));
  process.exit(0);
} catch (e) {
  const name = e && e.constructor ? e.constructor.name : "Error";
  console.error(`THREW ${name}: ${e && e.message ? e.message : e}`);
  process.exit(1);
}
