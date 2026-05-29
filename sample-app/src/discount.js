// Discount codes. Amounts are integer cents.

const DEFAULT_CODES = {
  WELCOME10: { percent: 10 },
  SAVE20: { percent: 20 },
};

/**
 * Apply a discount code to a subtotal. Unknown codes are ignored (no discount),
 * rather than crashing the request.
 *
 * @param {number} subtotal
 * @param {string} code
 * @param {Record<string, { percent: number }>} [codes]
 */
export function applyDiscount(subtotal, code, codes = DEFAULT_CODES) {
  const rule = codes[code];
  if (!rule) return subtotal; // unknown / empty code → charge full price
  return Math.round(subtotal * (1 - rule.percent / 100));
}
