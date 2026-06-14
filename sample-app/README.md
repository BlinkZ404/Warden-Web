# checkout-service (sample target app)

A tiny, **zero-dependency** checkout service that stands in for "the app a
non-technical founder vibe-coded with v0." Warden watches it, and when a
production error fires, it diagnoses → fixes → verifies → ships (with one-tap
human approval).

It has no dependencies on purpose: the Warden verification gate runs this
app's tests (`node --test`) and a reproduction script **offline**, so the whole
pipeline works without installing anything.

```
src/checkout.js     pricing (cents)
src/discount.js     discount codes
server.js           POST /api/checkout
test/               node:test suite (all green)
scripts/reproduce.js  replays a specific production-failing request
```

The committed code is **correct**: all tests pass. The demo *injects* a known
bug into an isolated per-incident git workspace (never this source tree) to
reproduce a production crash, then lets Warden fix it. See
`../lib/sim/bugs.ts` for the catalog of injectable bugs.

```bash
npm test          # node --test  → all pass
npm start         # serve on :3100
```
