import test from "node:test";
import assert from "node:assert/strict";
import { applyDiscount } from "../src/discount.js";

test("applies a known discount code", () => {
  assert.equal(applyDiscount(1000, "WELCOME10"), 900);
});

// Regression guard: an unknown / mistyped code must not crash the request.
test("ignores an unknown discount code", () => {
  assert.equal(applyDiscount(1000, "NOPE"), 1000);
});
