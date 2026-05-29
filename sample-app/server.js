// Minimal checkout service (zero dependencies) for the demo. In production this
// would be a Next.js app on Vercel with the Sentry SDK installed; here the
// failing request path is where Sentry would capture the exception.
import { createServer } from "node:http";
import { computeCheckoutTotal } from "./src/checkout.js";
import { applyDiscount } from "./src/discount.js";

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
        // 👇 In production, the Sentry SDK reports this exception, which is what
        //    wakes Nightshift up.
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
