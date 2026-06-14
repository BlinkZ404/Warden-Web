# Warden: Architecture (as built)

Warden is a **control plane** above commodity pieces (Sentry, Claude, OpenAI,
Vercel). The product is the orchestration, the safety model, and the database, not any single integration.

## Data flow

```mermaid
flowchart TB
 subgraph sources["Error sources (pluggable)"]
 S[Sentry webhook]:::live
 CI[CI failure]:::stub
 UP[Uptime monitor]:::stub
 UR[User report]:::stub
 end

 S --> ING["/api/ingest/sentry/<br/>verify signature · de-dupe by fingerprint"]
 CI -.-> ING
 UP -.-> ING
 UR -.-> ING

 ING --> Q[(jobs table<br/>lightweight queue)]
 Q --> ORCH{{Orchestrator<br/>stateless · resumable · idempotent}}

 ORCH <--> DB[(Amazon Aurora PostgreSQL<br/>Serverless v2 + pgvector)]

 ORCH --> INV[Investigator · Claude<br/>read-only DB role]
 ORCH --> FIX[Fixer · Claude<br/>patch on a branch; no deploy]
 ORCH --> REV[Reviewer · OpenAI<br/>diff + git-history checks]
 ORCH --> GATE[[verification gate<br/>tests + error-gone + no-new-errors]]
 ORCH --> DEP[Deploy adapter · Vercel<br/>preview → promote → rollback]

 GATE --> PUSH[Web push / Slack]
 PUSH --> PWA[Mobile approval PWA]
 PWA -->|one human tap| ORCH

 DASH[Next.js dashboard<br/>list · pipeline · audit · scorecard] --> DB

 classDef live fill:#15351f,stroke:#3fb950,color:#e7eaf0;
 classDef stub fill:#2a2410,stroke:#d29922,color:#e7eaf0,stroke-dasharray:4 3;
```

Solid = wired in v1. Dashed = clean stub seam (`lib/adapters/sources.ts`).

## Incident lifecycle (state machine)

Only the transitions below are legal (`lib/statemachine/transitions.ts`). There
is **no path to `deploying` that skips verification and a human approval row.**

```mermaid
stateDiagram-v2
 [*] --> detected
 detected --> triaging
 triaging --> investigating
 investigating --> fix_proposed
 fix_proposed --> under_review
 under_review --> verifying: reviewer approves
 under_review --> escalated: disagreement (uncertain/reject)
 verifying --> awaiting_approval: gate passes
 verifying --> escalated: gate fails
 awaiting_approval --> approved: human approves
 awaiting_approval --> dismissed: human rejects
 approved --> deploying
 deploying --> verifying_prod
 verifying_prod --> resolved: prod healthy
 verifying_prod --> rolled_back: error-rate spike
 rolled_back --> escalated
 investigating --> escalated: low confidence (don't guess)
 resolved --> [*]
 dismissed --> [*]
```

## The database is the product (PLAN §4, §9)

Aurora PostgreSQL is used as three things at once:

| Role | Tables |
|---|---|
| **State machine** | `incidents.status` (enum) + legal transitions |
| **Append-only event log (audit)** | `events`: the source of truth for "what happened" |
| **Vector memory** | `incidents.embedding` (pgvector): "have we seen this before?" |
| **Learning** | `agent_scorecard`: each agent's accuracy over time |

Per-incident artifacts: `investigations`, `fix_attempts`, `reviews`,
`verifications`, `approvals`, `deployments`, `outcomes`.

## The safety model (PLAN §5)

```mermaid
flowchart LR
 A[Agents propose] --> B[[verification gate<br/>REAL safety net]]
 A --> C[Consensus filter<br/>disagree → escalate]
 B --> D{All true?<br/>tests pass · error gone · no new errors}
 C --> D
 D -->|yes| E[Human gate<br/>consent, not correctness]
 D -->|no| F[escalate / fail]
 E -->|approves| G[Promote to prod]
 G --> H[Watch error rate<br/>spike → instant rollback]

 classDef x fill:#12151c,stroke:#232834,color:#e7eaf0;
 class A,B,C,D,E,F,G,H x;
```

- Agents have **no standing deploy authority**. Only a human-written `approvals`
 row moves an incident out of `awaiting_approval`.
- Deterministic verification is the real gate; agent agreement is only a filter.
- Investigation uses a **read-only** DB connection (`readOnlyQuery`); writes
 there throw. Deploy credentials never reach the model.
- Every production change is reversible (Vercel instant rollback).

## Simulation vs. live

The principled line: **simulate what needs accounts/keys; keep the safety-critical
verification real.**

| Capability | Simulation (default, offline) | Live (`WARDEN_MODE=live` + key) |
|---|---|---|
| Error source | synthetic Sentry events | real Sentry webhook + HMAC verify |
| Fixer / Reviewer | deterministic, real git edits + real diff analysis | Anthropic / OpenAI APIs |
| Embeddings | local hashing vectorizer (deterministic) | embeddings API |
| Deploy / rollback | recorded, plausible URLs | Vercel API |
| Push delivery | recorded as a `notification` event | web-push (VAPID) |
| **Verification gate** | **REAL: runs the target app's tests + reproduction** | **REAL** |

Each capability flips independently when its secret is present, so a
half-configured environment still runs end to end.
