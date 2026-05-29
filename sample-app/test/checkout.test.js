import test from "node:test";
import assert from "node:assert/strict";
import { computeCheckoutTotal } from "../src/checkout.js";

test("computes total for a normal cart", () => {
  const cart = {
    taxRate: 0.1,
    items: [
      { sku: "MUG", price: { amount: 1000 }, quantity: 2 },
      { sku: "TEE", price: { amount: 500 }, quantity: 1 },
    ],
  };
  const r = computeCheckoutTotal(cart);
  assert.equal(r.subtotal, 2500);
  assert.equal(r.tax, 250);
  assert.equal(r.shipping, 500);
  assert.equal(r.total, 3250);
});

test("free shipping over the threshold", () => {
  const cart = {
    taxRate: 0,
    items: [{ sku: "DESK", price: { amount: 9000 }, quantity: 1 }],
  };
  assert.equal(computeCheckoutTotal(cart).shipping, 0);
});

// Regression guard for the production "checkout crash": a promo line item with
// no price must not blow up the basket.
test("handles a promo line item with no price", () => {
  const cart = {
    taxRate: 0.1,
    items: [
      { sku: "MUG", price: { amount: 1000 }, quantity: 1 },
      { sku: "FREE-GIFT", quantity: 1 }, // no `price` — used to throw a TypeError
    ],
  };
  const r = computeCheckoutTotal(cart);
  assert.equal(r.subtotal, 1000);
});
