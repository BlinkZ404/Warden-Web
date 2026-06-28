# Engineering standards: how Warden is built

A short, honest account of how the codebase aligns to platform best practices. The
intent is to show this is production-grade scaffolding, not a demo held together
with tape, and to be candid about the two places we chose a deliberate trade-off.

## Alignment scorecard

| Area | Standard | How Warden meets it |
|---|---|---|
| **Model selection** | Default to the latest, most capable models; keep cost flexible | Catalog defaults to the current Claude line (Opus 4.8, Sonnet 4.6, Haiku 4.5, Fable 5); cheap models stay available for the 3-agent reviewer panel so a panel costs pennies. |
| **Data layer (Aurora / Postgres)** | Pooled connections, idempotent migrations, a safe job queue, parameterized SQL | Pooled `pg`; idempotent numbered migrations; a `jobs` queue using `FOR UPDATE SKIP LOCKED` with lease heartbeats and backoff; pgvector with an HNSW index; the incident state machine and its legal transitions enforced in the schema, not in a prompt. |
| **Security** | Least privilege, secrets never leak, tamper-evident records | Secrets masked on read and a blank value never overwrites a stored one; `WRITABLE_KEYS` excludes platform secrets so the runtime overlay cannot shadow env config; OAuth state-signing fails closed when unconfigured; an append-only, HMAC-verified audit; a read-only investigation role; a default-on conservative-patch boundary that keeps the Fixer off migrations, schema, auth, and secrets. |
| **Next.js on Vercel** | App Router, correct route runtimes, clean client/server split | App Router throughout; route handlers declare `runtime` and `dynamic` explicitly; interactive surfaces are client components, data access stays server-side. |
| **Testing** | Real integration coverage, not mocks of the thing that matters | 111 tests across 24 files against a real Postgres, headlined by an executable end-to-end acceptance spec; the verification gate and its fail-closed behavior (a zero-test run is never mistaken for a passing suite) are themselves tested. |

## One source of truth

The protected-path floor (what the Fixer may never auto-edit) and the
reversibility classifier (whether a one-tap revert is data-safe) both rest on the
same set of schema and data file classes. That set is defined once, as
`DATA_SCHEMA_GLOBS` in `lib/policy/gate.ts`, and both consumers import it, so the
patch boundary and the reversibility promise cannot drift apart.

## Deliberate trade-offs

Two places where the conventional default was not the right call for this product:

- **A custom provider layer instead of the Vercel AI Gateway.** Warden calls models
  through a thin OpenAI-compatible client. That is intentional: it is what lets a
  customer bring their own key and lets any role run on any provider (frontier or
  cheap) interchangeably, which is core to the unit economics. The AI Gateway would
  simplify observability and failover and is a sensible later addition; it is not a
  prerequisite, and adopting it would trade away some of the provider-agnosticism.
- **Type-checking and tests as the gate, not ESLint.** `tsc` plus the test suite are
  the enforced quality gate. A formal lint config is a post-submission addition; it
  was not adopted now to avoid a large, low-signal churn close to the deadline.
