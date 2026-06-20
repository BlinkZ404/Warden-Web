// Minimal checkout service (zero dependencies) for the demo. In production this
// would be a Next.js app on Vercel with the Sentry SDK installed; here the
// failing request path is where Sentry would capture the exception.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeCheckoutTotal } from "./src/checkout.js";
import { applyDiscount } from "./src/discount.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The founder's ORIGINAL checkout, before Warden's fix: it reads `item.price.amount`
// with no guard, so a free-gift line item (which arrives with no `price`) throws
// `TypeError: Cannot read properties of undefined (reading 'amount')` in production.
// This is the exact bug the demo storefront (GET /) triggers and Sentry captures;
// the fixed, guarded version lives in src/checkout.js.
function originalCheckoutTotal(cart) {
  let subtotal = 0;
  for (const item of cart.items) {
    subtotal += item.price.amount * item.quantity;
  }
  const taxRate = cart.taxRate ?? 0;
  const tax = Math.round(subtotal * taxRate);
  const shipping = subtotal > 5000 ? 0 : 500;
  return { subtotal, tax, shipping, total: subtotal + tax + shipping };
}

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/checkout") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const cart = JSON.parse(body || "{}");
        const priced = computeCheckoutTotal(cart);
        const total = cart.code
          ? applyDiscount(priced.total, cart.code)
          : priced.total;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ...priced, total }));
      } catch (err) {
        // In production, the Sentry SDK reports this exception, which is what
        //    wakes Warden up.
        console.error("checkout failed:", err);
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(err && err.message) }));
      }
    });
    return;
  }

  // The demo storefront. Open this in a browser and click Pay to record the real
  // production crash for the cold open.
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    try {
      const html = readFileSync(join(__dirname, "public", "index.html"));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "storefront not found" }));
    }
    return;
  }

  // The storefront posts the shopper's cart here. Runs the unguarded original
  // checkout, so a cart with a free-gift line item throws the production TypeError.
  if (req.method === "POST" && req.url === "/api/pay") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const cart = JSON.parse(body || "{}");
        const priced = originalCheckoutTotal(cart);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(priced));
      } catch (err) {
        // In production, the Sentry SDK reports this exception, which is what
        //    wakes Warden up.
        console.error("checkout failed:", err);
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(err && err.message) }));
      }
    });
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

const port = Number(process.env.PORT) || 3100;
server.listen(port, () => console.log(`checkout-service listening on :${port}`));
