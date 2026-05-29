# Going live — the human steps

Nightshift is **built and verified in simulation mode** against a real Postgres,
and is **Aurora/Vercel-ready**. Everything below is inherently human/account-
gated (it needs *your* accounts, dashboards, billing, and secrets), which is why
it wasn't automated. None of it changes application code — it's configuration.

> TL;DR: provision Aurora → deploy to Vercel → connect Sentry → add keys → set
> `NIGHTSHIFT_MODE=live`. Each capability flips to "real" independently as soon
> as its secret is present, so you can do these in any order and test
> incrementally.

---

## 1. Amazon Aurora PostgreSQL (Serverless v2) — the required data store

1. RDS console → **Create database** → Amazon Aurora → **PostgreSQL-compatible**
   → **Serverless v2** capacity. Pick a min/max ACU (0.5–2 ACU is plenty for the
   demo).
2. Create a database named `nightshift`. Note the **writer endpoint**, port,
   user, password.
3. Enable **pgvector**: connect and run `CREATE EXTENSION IF NOT EXISTS vector;`
   (the migration does this too, but the master role needs the privilege).
4. Set `DATABASE_URL` to the Aurora endpoint:
   `postgres://USER:PASS@your-cluster.cluster-xxxx.us-east-1.rds.amazonaws.com:5432/nightshift`
   (TLS is auto-enabled for non-localhost hosts; for strict verification, attach
   the RDS CA bundle and set `PGSSLMODE=verify-full`).
5. Apply the schema: `DATABASE_URL=... npm run migrate`.

📸 **Storage-config screenshot** (submission requirement): capture the RDS
console page showing the Aurora **Serverless v2** cluster.

## 2. Vercel (front end + deploy/rollback target)

1. Push this repo to GitHub and **Import** it into Vercel (Next.js auto-detected).
2. Project → **Settings → Environment Variables**: set `DATABASE_URL`,
   `NIGHTSHIFT_MODE=live`, and the keys from the sections below.
3. Deploy. Note the **production URL** and your **Vercel Team ID**
   (Team Settings → General) — both are submission requirements.
4. Drive the orchestrator on a schedule — add to `vercel.json`:
   ```json
   { "crons": [{ "path": "/api/orchestrator/tick", "schedule": "* * * * *" }] }
   ```
   (or run `npm run worker` on any always-on host).
5. For the **deploy/rollback adapter**, create a Vercel **token** and set
   `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`. Secrets live only in
   the deploy adapter — they are never exposed to the agents (PLAN §5.6).

## 3. Sentry (error source)

1. Create/select a Sentry project for your app and install the SDK so errors are
   captured.
2. Add an **Internal Integration / webhook** pointing issue alerts at
   `https://YOUR-APP.vercel.app/api/ingest/sentry`.
3. Set `SENTRY_CLIENT_SECRET` to the integration's secret — the ingress verifies
   the `sentry-hook-signature` HMAC and rejects anything unsigned.

## 4. Agent API keys (Fixer + Reviewer)

| Env | Used by | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Fixer + Investigator (Claude) | `ANTHROPIC_MODEL` defaults to `claude-opus-4-8` |
| `OPENAI_API_KEY` | Reviewer (Codex) | `OPENAI_MODEL` defaults to `gpt-5-codex` |
| `EMBEDDING_API_KEY` | incident memory | optional — falls back to the deterministic local embedder |

The live agent adapters are written but **untested without keys**; budget a pass
to validate Claude's patch application and Codex's review JSON against your real
target repo, and point `TARGET_REPO_PATH` / the workspace clone at it.

## 5. Web push (mobile approval)

```bash
npx web-push generate-vapid-keys
```

Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:you@...`, and
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` (same public key). Until these exist, the approval
screen shows "push: demo mode" and notifications are recorded to the audit log
instead of sent.

## 6. Flip the switch

Set `NIGHTSHIFT_MODE=live`. Any capability whose secret is missing **degrades
gracefully back to simulation** for that capability only — so a partially
configured environment still runs end to end.

---

## Hackathon submission checklist (PLAN §4)

- [ ] Text description that **names the database** (Amazon Aurora PostgreSQL Serverless v2).
- [ ] ~3-min demo video (follow PLAN §14 / `npm run demo` narration).
- [ ] Published **Vercel project link** + **Vercel Team ID**.
- [ ] **Architecture diagram** — [docs/architecture.md](docs/architecture.md).
- [ ] **Storage-config screenshot** proving Aurora usage (step 1).

## Cost watch (PLAN §16)

Watch AWS spend (Cost Explorer; Aurora Serverless v2 bills per-ACU-hour — set a
low max ACU and an auto-pause if available) and agent/token usage. The hackathon
credits are sized for typical dev usage only.
