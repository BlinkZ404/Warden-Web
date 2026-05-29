// Checkout pricing. Amounts are integer cents.
//
// This is the kind of code an AI app builder ships: readable, mostly fine, with
// one sharp edge that only certain inputs hit in production. The guarded version
// here is correct; Nightshift's demo injects the unguarded edge into an isolated
// workspace to reproduce the production crash.

/**
 * @param {{ taxRate?: number, items: Array<{ sku: string, price?: { amount: number }, quantity: number }> }} cart
 */
export function computeCheckoutTotal(cart) {
  let subtotal = 0;
  for (const item of cart.items) {
    // Promo / free-gift line items arrive with no `price` object. Coalesce to 0
    // so they don't crash the basket.
    const unit = item.price?.amount ?? 0;
    subtotal += unit * item.quantity;
  }
  const taxRate = cart.taxRate ?? 0;
  const tax = Math.round(subtotal * taxRate);
  const shipping = subtotal > 5000 ? 0 : 500;
  return { subtotal, tax, shipping, total: subtotal + tax + shipping };
}
