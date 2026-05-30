# 🌙 Warden

**The on-call engineer you don't have.** It catches production errors, fixes
them, checks itself, and waits for your one-tap approval before anything ships.

Built for solo / non-technical founders shipping AI-built apps (v0, Cursor,
Claude Code) with no engineer — the people who *can't read the diff*. Safety
comes from **verification, not code review**: deterministic checks + cheap
reversibility + a human consent gate, not from a human vetting the patch.

> H0 hackathon (Track 2). Primary data store: **Amazon Aurora PostgreSQL
> (Serverless v2)** + pgvector. Front end: **Next.js on Vercel**.

---

## What it does

```
production error → diagnose → fix on a branch → an independent agent reviews it
→ deploy a preview + VERIFY (tests pass, the error stops, no new errors)
→ 📲 founder gets a plain-English push → one tap to ship · one tap to revert
→ everything recorded in Aurora (state machine + audit log + memory + scorecard)
```

It's not a better debugger — it's the **control plane** above commodity pieces
(Sentry, Claude, Codex, Vercel), which are pluggable adapters, not the product.

## What's built (and proven)

The full incident pipeline (PLAN milestones **M0–M11**) runs **end-to-end in
simulation mode against a real Postgres**, with a green §13 acceptance test:

- ✅ Deterministic **state machine** + append-only **audit log** (`events`)
- ✅ **Ingest** with signature verification + fingerprint de-dup
- ✅ Stateless, **resumable, idempotent, fault-isolated** orchestrator
- ✅ **Read-only** investigation · **Fixer** (Claude) · **Reviewer** (Codex) cross-check
- ✅ **Deterministic verification gate** — runs the target app's *real tests* + a *real reproduction*
- ✅ **Human approval gate** (consent, not correctness) + web-push plumbing + mobile PWA
- ✅ **Deploy / instant rollback** adapter + auto-rollback on prod regression
- ✅ **pgvector memory** ("seen this before?") + **agent scorecard** (learning)
- ✅ **Dashboard**: incident list, live pipeline state, full audit trail, scorecard
- ✅ Vendor-neutral **trigger-source stubs** (CI / uptime / user-report)

**Simulation mode** mocks only what needs accounts/keys (Sentry, Vercel, push
delivery, the LLMs). The **safety-critical verification stays real** — it
genuinely runs `node --test` and a reproduction script against the patched code.
Flip to **live** by setting `WARDEN_MODE=live` and adding keys (see
[GO-LIVE.md](GO-LIVE.md)).

## Quick start (zero external accounts)

Requires Node 20+ and Docker.

```bash
npm install
npm run db:up          # start the bundled Postgres (pgvector) in Docker
npm run migrate        # apply the schema (PLAN §9)
npm run demo           # drive a seeded production error end-to-end, narrated
```

Try the other scenarios:

```bash
npm run demo -- checkout-missing-price-risky    # disagreement → escalate
npm run demo -- checkout-prod-regression        # approve → auto-rollback
```

Run the app + dashboard:

```bash
npm run seed           # populate a spread of incidents
npm run dev            # http://localhost:3000/dashboard
npm run worker         # (optional) background job worker; or use /api/orchestrator/tick
```

Open `/dashboard`, click **Trigger a demo incident**, watch the pipeline run
live, then open the incident → **Approve & ship**. The founder's phone view is
`/approve/<incidentId>`.

## How it works (the 3 ideas)

1. **Incident-first, not PR-first.** It starts from a production error and
   decides whether a fix is warranted. There's no PR until it makes one.
2. **Trust by verification, not review.** The founder can't vet code, so the
   gate is deterministic (`lib/policy/gate.ts`): the test passes, the original
   error stops reproducing on the preview, and no new errors appear. Two agents
   from different model families cross-check, but **agreement is only a filter —
   disagreement escalates; it never overrides a failed check** (PLAN §5.3–5.4).
3. **The database is the product.** Aurora is a deliberate state machine + event
   log + pgvector memory + scorecard. Every decision is recorded, so the system
   gets safer and smarter over time.

See [docs/architecture.md](docs/architecture.md) for diagrams.

## Project layout

```
app/                       Next.js App Router
  dashboard/               incident list + detail (live pipeline, audit trail, scorecard)
  approve/[id]/            mobile approval PWA (one-tap ship/revert)
  api/                     ingest webhook · orchestrator tick · incidents · approve · push
lib/
  statemachine/            legal transitions + atomic, audited state changes
  orchestrator/            step runner (one idempotent step per state) + job worker
  agents/                  Investigator · Fixer (Claude) · Reviewer (Codex) — sim + live
  adapters/                sentry · workspace (git) · deploy (Vercel) · sources (stubs)
  policy/                  verification gate, consensus, SQL-mutation guard
  memory/                  deterministic + live embeddings (pgvector)
  repo/  db/               typed repositories + Postgres access
  sim/bugs.ts              seeded-bug catalog (real inject/fix code edits)
migrations/                §9 schema (idempotent) + runtime tables
sample-app/                zero-dependency "checkout" app Warden watches
scripts/                   migrate · seed · worker · demo
test/                      state machine · workspace · orchestrator · policy · §13 e2e
```

## Testing

```bash
npm test          # full suite (needs the Docker DB up)
npm run typecheck # tsc --noEmit
npm run build     # next production build
```

The headline test is [`test/e2e.test.ts`](test/e2e.test.ts) — the §13 acceptance
criteria as one executable spec (detect → … → resolved, the no-ship-without-
approval invariant, disagreement→escalate, prod-regression→rollback, dedup, and
pgvector repeat-detection).

## Going live / hackathon submission

The repo is built and tested in simulation mode and is **Aurora/Vercel-ready**.
The remaining steps are inherently human/account-gated (provision Aurora, deploy
to Vercel + grab the Team ID, connect Sentry, add API keys, storage-config
screenshot). They're all in **[GO-LIVE.md](GO-LIVE.md)**.

## Safety model (never violated)

Agents have no standing deploy authority · deterministic verification is the real
gate · human approval is consent not correctness · data mutations are human-only
in v1 (read-only investigation is autonomous) · least privilege (read-only DB
role; deploy creds never reach the model) · every change is reversible · when
uncertain, escalate — never guess. See PLAN §5.
