# Warden: Build Plan

**Tagline:** The on-call engineer you don't have. It catches production errors, fixes them, checks itself, and waits for your one-tap approval before anything ships.

**Working name:** Warden.

> Implementation status note (kept in sync with the code): the full incident
> pipeline (M0–M11) is built and verified in **simulation mode** against a real
> Postgres (Docker pgvector locally; Aurora-ready for prod) with a green §13
> end-to-end test. The remaining work is inherently human/account-gated; see
> [../operations/go-live.md](../operations/go-live.md).

## 1. The problem & who it's for

**ICP:** solo / non-technical founders shipping AI-built apps (v0, Cursor, Claude Code) with no engineer. They are simultaneously the builder, the marketer, the support team, and the on-call. When prod breaks, the cost isn't just downtime; it's a lost week of momentum.

Today their options are: monitoring tools that observe but don't fix; coding agents that explicitly require a developer to review the fix; or hiring a human "cleanup specialist." Nothing closes the loop for someone who can't read the diff.

## 2. What it does (plain version)

An error fires in production → Warden gets pinged → it diagnoses the cause and writes a fix → a second AI independently checks the fix against the code's history → the fix is deployed to a preview and verified (tests pass, the error stops, no new errors) → the founder gets a phone notification with a readable summary → one tap to ship, one tap to revert.

## 3. What makes it different

It is not a better debugger. It's the control plane that sits above the commodity pieces:

- **Incident-first, not PR-first.** It starts from a production error and decides whether a fix is warranted; there's no PR until it makes one.
- **Trust by verification, not code review.** The founder can't vet code, so safety comes from verification checks + cheap reversibility, not from them reading a diff.
- **Multi-agent + human gate.** Two agents (different model families) cross-check; nothing ships without the test passing and a human approving.
- **Vendor-neutral.** Error sources and agents are pluggable adapters. Sentry, Claude, OpenAI are interchangeable parts, not the product.
- **Memory.** Every incident, fix, verdict, decision, and outcome is logged; the system recognizes repeat incidents and tracks each agent's accuracy over time.

Closest real competitor is Sentry Seer (error → root cause → PR → review). The edge is the founder ICP and the verify-not-review trust model.

## 4. Platform fit

- Monetizable B2B SaaS.
- Primary data store: **Amazon Aurora PostgreSQL (Serverless v2)** + pgvector; front end deployed on **Vercel**. Both satisfied (see §7).
- The database does quadruple duty: state machine + event log + vector memory + agent scorecard.

## 5. Non-negotiables (the safety model: never violate)

1. **Agents have no standing write/deploy authority.** The orchestrator never merges or promotes to production without an explicit human-issued approval recorded in the DB.
2. **The human gate = consent, not correctness.** Approval means "I consent to ship this." It does not mean the code was vetted by a human.
3. **Deterministic verification is the real gate:** the test passes, the original error stops recurring on the preview, and no new errors appear. Agent agreement is a filter, never the safety net.
4. **Multi-agent agreement is a weak/correlated signal.** Surface disagreement as an escalation ("don't auto-handle"), not just a pass/fail.
5. **Data mutations are human-only in v1.** Read-only DB investigation is allowed and autonomous. Any write/UPDATE/DELETE requires a dry-run (transaction + rollback) shown to the human in readable + an Aurora snapshot first. Default to NOT doing data fixes.
6. **Least privilege.** The investigation agent connects with a read-only DB role. Deploy credentials are never exposed to the model.
7. **Reversibility is mandatory.** Every production change has a one-tap rollback (Vercel instant rollback) and, for data, point-in-time recovery.
8. **Conservative scope.** Auto-handle only low-risk fix classes. When uncertain, escalate to the human; never guess.

## 6. Core flow → state machine

`incidents.status` enum:

```
detected
 → triaging (dedupe, severity, similar-incident lookup)
 → investigating (read-only context gathering, root cause)
 → fix_proposed (Claude writes patch on a branch; no merge, no deploy)
 → under_review (OpenAI reviews diff + git history; consensus computed)
 → verifying (deploy preview, run tests, confirm error stops)
 → awaiting_approval (push notification → mobile approval screen)
 → approved (human said ship)
 → deploying (promote preview → production)
 → verifying_prod (confirm fixed in prod; watch error rate)
 → resolved | failed | rolled_back | escalated | dismissed
```

Every transition writes an append-only row to the `events` table (the audit trail). The orchestrator is stateless and resumable; on restart it reads current state from the DB and continues.

## 7. Architecture

```
Sentry (error → webhook) [pluggable: CI / monitor / user report; stubbed v1]
 │
 ▼
Ingest (API route on Vercel): verify signature, de-dupe by fingerprint
 │
 ▼
Queue (lightweight job table)
 │
 ▼
Orchestrator (state-machine driver) ──read/write──▶ Aurora PostgreSQL (Serverless v2)
 │ • state-machine tables
 │ • append-only event log (audit)
 │ • pgvector incident memory
 │ • agent_scorecard
 ├─▶ Fixer = Claude
 ├─▶ Reviewer = OpenAI
 ├─▶ verification gate: tests + preview-error-check
 └─▶ Deploy adapter (Vercel): preview → verify → promote → rollback

Vercel front end (Next.js): dashboard + mobile approval PWA (reads state from Aurora)
 ▲
 └─ Web push / Slack ping → Engineer approves on phone
```

See [architecture.md](architecture.md) for the as-built diagram.

## 8. Deployment: not GitHub-centric

"GitHub" bundles three jobs; keep them separate: code store + diff (git); approval artifact (a Vercel preview URL + readable summary, NOT a PR); deploy + rollback (Vercel CLI/API). Default path: agent commits to a branch → preview → verify → on approval promote → rollback = `vercel rollback`. A PR mode lives behind the same adapter for teams.

## 9. Data model

See [migrations/0001_init.sql](migrations/0001_init.sql) for the as-built schema (it matches this section). Operational tables (job queue, push subscriptions) are in [migrations/0002_runtime.sql](migrations/0002_runtime.sql).

## 10. Guardrail / policy layer

Code fixes; must all be true before `awaiting_approval`: reviewer verdict is `approve`; `test_passed = true`; `error_recurred = false`; no new error signatures; change scope sane. DB operations: read-only autonomous; writes human-only in v1, statically blocked if unscoped/DDL, dry-run + snapshot required. Implemented in [lib/policy/](lib/policy/).

## 11. Build scope

**v1; built end-to-end (one vertical):** Sentry error → investigate (read-only) → Claude fix on a branch → OpenAI review (incl. git history) → preview deploy + verify → push notification → mobile approval → promote to prod → verify → record outcome + update memory/scorecard → one-tap rollback.

**Stubbed (clean seams):** CI-failure source, uptime-monitor source, user-report source; see [lib/adapters/sources.ts](lib/adapters/sources.ts).

**Out of scope for v1:** autonomous data mutations; multi-tenant auth; billing; non-Sentry triggers; non-Vercel deploy targets.

## 12. Milestones

M0 Scaffold · M1 Data + state machine · M2 Ingest · M3 Orchestrator skeleton · M4 Investigation (read-only) · M5 Fixer (Claude) · M6 Reviewer (OpenAI) · M7 Deterministic verification · M8 Approval · M9 Deploy + rollback · M10 Memory/learning · M11 Dashboard · M12 Stubs, seed bugs, README, architecture diagram. **All built; see README "What's built".**

## 13. Acceptance criteria (v1 "done")

An injected bug flows automatically through detect → investigate → fix → review → verify → approve → deploy → verify, with: a complete audit trail in `events`; nothing shipping without `test_passed = true` AND a human `approvals` row; a working one-tap rollback; a repeat incident recognized via pgvector; agents' actions/outcomes in `agent_scorecard`. **Covered by [test/e2e.test.ts](test/e2e.test.ts).**

## 14. Demo script (~3 min)

1. "I built this app with v0. I have no engineer."
2. App throws a real error (seeded). Sentry catches it.
3. Phone buzzes: "Found a fix for the checkout crash."
4. Open it: readable summary + "tested on a preview, the error is gone, no new errors."
5. Tap Approve. It's live in seconds.
6. Show the dashboard: full audit trail, who/what did each step.
7. Bonus: trigger a regression → auto-rollback. And show "we've seen this before" memory.
8. Close on the DB: "every decision, fix, and outcome lives in Aurora."

## 15. Tech stack summary

Next.js (App Router) on Vercel; mobile approval PWA with web push. Amazon Aurora PostgreSQL (Serverless v2) + pgvector. Event-driven orchestration (job table; stateless/resumable). Agents pluggable behind an `Agent` interface (Fixer = Claude; Reviewer = OpenAI). Integrations: Sentry, GitHub (git), Vercel. Secrets never exposed to the model.

## 16. Open decisions / known risks

Verification depth (reproduce the error against the preview; escalate when not reproducible). No tests in vibe-coded apps (generate a smoke test). Correlated agent blind spots (don't let "both agreed" override a failed verification check). Autonomy danger (keep scope conservative, human gate, instant rollback). Cost (watch AWS + token usage).
