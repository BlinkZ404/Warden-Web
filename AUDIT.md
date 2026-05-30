# Hardening audit — findings & disposition

A multi-agent adversarial audit (10 dimensions, every finding independently
verified) raised 39 issues; **28 confirmed real**, 11 dismissed as dead-code /
hypothetical / perf-only. This file tracks each confirmed finding and what was
done. Status: ✅ fixed · 🛡️ made fail-closed + documented · 📋 documented as a
go-live requirement.

Big picture: the **simulation path is sound**; almost all critical/high issues
are **live-mode-only** (the live adapters were written but never exercised — see
GO-LIVE.md) or **fail-open behaviors made fail-closed** here.

## Critical
| # | Finding | Disposition |
|---|---|---|
| C1 | Live preview deploy & verified tree are disjoint (gate verifies a local workspace that's never pushed; promote ships an unrelated deployment) | 🛡️ deployPreview now refuses to fake-succeed; SHA-parity guard + 📋 real git-source/files deploy documented as a go-live requirement |
| C2 | `error_recurred` vacuously false in live mode (reproduce() only wired to the sim bug catalog) | 🛡️ live mode with no reproduction now **escalates** instead of passing |

## High
| # | Finding | Disposition |
|---|---|---|
| H1 | Live verification gate hollow for test-less repos | 🛡️ `runTests` now reports tests-collected; **0 tests collected ≠ pass** (fail-closed) |
| H2 | Per-incident git workspace local-disk-only, never rebuilt past `investigating` | ✅ diff persisted in `fix_attempts`; workspace rebuilt on demand at each consuming step |
| H3 | No lock heartbeat + ownership-blind complete/failJob → reclaim double-processing (double prod promote) | ✅ ownership-scoped complete/fail, lease heartbeat, one-active-job index, idempotent promote guard |
| H4 | `new_errors` hardcoded `[]`; UI shows permanent green "No new errors" | ✅ UI relabeled to "No new errors **detected**"; 📋 live signal documented |
| H5 | `test_passed` vacuously true for test-less repos (`node --test` exits 0 with 0 tests) | ✅ same fix as H1 |
| H6 | Aurora TLS `rejectUnauthorized:false` hardcoded; `PGSSLMODE` ignored | ✅ honors `PGSSLMODE`/`PGSSLROOTCERT`; secure-by-default for remote hosts |
| H7 | Live `deployPreview` body invalid → every live deploy 400s | ✅ removed invalid `target`; gitSource scaffold; 📋 deploy parity documented |
| H8 | Live fixer round-trips whole file as JSON under `max_tokens:4096` → truncation | ✅ `stop_reason:max_tokens` detected → clean escalate; 📋 switch to diff/tool-use documented |
| H9 | Anthropic responses `JSON.parse`d assuming pure JSON (no JSON mode) | ✅ fence-strip + try/catch + typed-block guard, escalates with context |
| H10 | Vercel rollback passes the **just-shipped** deployment id, not the previous-good one | ✅ previous-prod id captured before promote; rollback targets it; none → escalate |
| H11 | verifying→escalated (gate fail) had no integration test | ✅ test added |

## Medium
| # | Finding | Disposition |
|---|---|---|
| M1 | Intra-step crash idempotency: `applyEdit` anchor consumed → wedged; `stepVerifying` double-deploy | ✅ `applyEdit`/`commitAll` made idempotent; dedupe deployment |
| M2 | `guardMutation` fails OPEN (comment/multi-statement/CTE/`WHERE 1=1`) — currently dead code | ✅ fail-closed classifier + adversarial tests |
| M3 | Sentry webhook fails open when `SENTRY_CLIENT_SECRET` unset in live | ✅ hard-gated in live (503 misconfig / 401 bad sig) |
| M4 | Live reviewer uses `gpt-5-codex` on `/chat/completions` (rejected) | ✅ default model → chat-completions-compatible; defensive parse |
| M5 | Human REJECT → dismissed untested | ✅ test added |
| M6 | Failed-job retry/backoff/escalate + reclaimStale untested | ✅ tests added |
| M7 | Memory `0.92` threshold + `findSimilar` pgvector SQL untested | ✅ DB boundary test added |

## Low
| # | Finding | Disposition |
|---|---|---|
| L1 | approve/revert/tick routes unauthenticated | 🛡️ optional `NIGHTSHIFT_API_SECRET` gate (on when set); 📋 full auth = go-live |
| L2 | Live `verifyProdHealth` is a no-op that always returns healthy | 🛡️ live branch fails closed (escalate) until a real signal is wired |
| L3 | `failed` is an unreachable terminal state | 📋 left as-is (harmless); noted |
| L4 | SQL-guard tests only trivial cases | ✅ adversarial cases added (see M2) |
| L5 | Push subscription endpoint unvalidated (blind SSRF in live push) | ✅ https + private-host rejection |
| L6 | `needsSsl()` substring-matches the whole URL | ✅ parses hostname |
| L7 | Notification permission not feature-guarded | ✅ capability check + distinct state |
| L8 | Manifest icon lacks 192×192 (Chromium installability) | ✅ 192 added |

See GO-LIVE.md "Known live-mode gaps" for the 📋 items that require your
accounts/keys to finish and test.
