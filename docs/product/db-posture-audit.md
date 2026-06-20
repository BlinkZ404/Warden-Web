# Database posture audit: cross-provider design

How Warden audits a customer's database security posture and applies fixes, across
the backends vibe-coded apps actually run on. The guiding principle: **do not
re-implement detection where the provider already ships a maintained advisor. Read
it. Own detection only where no advisor exists, and own the fix everywhere** (the
vendor flags the problem; it will not write the founder a working policy).

The current `lib/security/rls.ts` lane already encodes the right loop (scan → plain
English finding → generated fix → one-tap consent → post-apply assertion) and
anticipates a live adapter. This is the design that slots behind that seam.

## Per-provider summary

| Provider | Native advisor? | How Warden detects | How Warden applies | Credential |
|---|---|---|---|---|
| **Supabase** | Yes (Security Advisor, powered by the open `splinter` linter) | Read `GET /v1/projects/{ref}/advisors/security` (returns lints with name/level/facing/remediation) | DDL via `POST /v1/projects/{ref}/database/query` | Management API personal access token (scoped `advisors_read`), NOT the service-role key |
| **Raw Postgres** (Neon, RDS/Aurora, self-hosted) | No | Own queries: `pg_class.relrowsecurity=false`, RLS-on-but-no-`pg_policies`, broad grants to `PUBLIC`/`anon` (`role_table_grants` + `has_table_privilege`), `pg_default_acl` | DDL over a scoped Postgres role | Read-only role (scan) + a scoped DDL role (apply) |
| **Firebase / Firestore** | Partial (rules engine, no scanner) | Firebase Rules API: list release, `rulesets.get` source, parse for `if true` / unauthenticated allows | New ruleset + release via the Rules API | GCP service account with `firebaserules` |
| **MongoDB Atlas** | Partial (network/auth signals) | Atlas Admin API: `0.0.0.0/0` IP access list, DB users / auth | Edit IP list / users via the Atlas Admin API | Atlas programmatic API key (scoped) |
| **PlanetScale** (MySQL/Vitess) | No (and no RLS primitive at all) | Own checks: MySQL user grants, connection / IP exposure (isolation is app-level only) | GRANT/REVOKE via a scoped MySQL user | Scoped MySQL user |

## Why read Supabase's advisor instead of re-detecting

Supabase's Security Advisor runs `splinter`, an open-source pure-SQL Postgres linter
whose security lints are exactly Warden's breach class and more: `rls_disabled_in_public`,
`policy_exists_rls_disabled`, `rls_enabled_no_policy`, `security_definer_view`,
`auth_users_exposed`. It is readable programmatically through the Management API, and
Supabase maintains the lint set as the platform evolves. Re-detecting in our own SQL
only invites drift; reading the native advisor covers the most-cited class of
vibe-coded RLS-misconfiguration breach. Warden still owns the **fix**:
the advisor says "RLS off on `users`"; it does not generate the owner-scoped policy a
non-technical founder needs, which is Warden's job.

## Where Warden must own detection

Raw Postgres (Neon, RDS/Aurora, self-hosted) and PlanetScale ship no advisor, so Warden
runs the canonical checks itself against the system catalogs. The core Postgres set:

- RLS off in exposed schemas: `relrowsecurity=false` on `public` base tables.
- RLS on but no policy (a silent default-deny misconfig): `relrowsecurity=true` with zero `pg_policies`.
- Over-broad grants to `PUBLIC` / `anon` (note `role_table_grants` omits `PUBLIC`, so cross-check `has_table_privilege`).
- Default privileges leaking to `PUBLIC` via `pg_default_acl`.

PlanetScale has no RLS primitive at all, so the check shifts to user grants and connection
exposure. Firebase's breach class is rules left in test mode (`allow read, write: if true`),
detected by reading the live ruleset source.

## Recommended adapter

A provider-adapter interface, four methods, with each provider deciding whether `scan`
proxies a native advisor or runs Warden's own checks:

```
interface PostureProvider {
  scan(readCred):           Finding[]      // native advisor OR own catalog queries
  generateFix(finding):     FixPlan        // provider-shaped: SQL DDL | Firestore rules | Atlas config
  apply(plan, applyCred):   ApplyResult
  assert(finding, readCred): boolean       // re-scan / probe under a least-privilege identity
}
```

The canonical normalized `Finding { id, resource, severity, facing(public|internal),
explanation, fixPreview }` generalizes splinter's row shape, so every provider maps into
it (this is the shape `lib/security/rls.ts` already produces).

## Credential boundaries (three tiers, never collapsed)

1. **Read / scan credential**: least privilege, read-only (Supabase PAT with `advisors_read`; a read-only Postgres role; a Firebase viewer; an Atlas read-only key).
2. **Scoped apply credential**: can run only the corrective change class (RLS DDL / a rules deploy / an Atlas IP-list edit), separate from the scan credential.
3. **Never the deploy or owner credential**: Warden never holds the founder's full project-owner or service-role key to make autonomous changes. The posture fix is applied through tier 2, distinct from the code-deploy path entirely.

## Verified vs. inferred

Verified against sources: the Supabase advisors endpoint and splinter lint names; the
Firebase Rules API flow; PlanetScale's lack of an RLS primitive; Atlas `0.0.0.0/0` as the
exposure signal. Inferred / design recommendations: the exact Supabase SQL-apply path
(query endpoint vs. a provisioned scoped role), and the three-tier credential model.
