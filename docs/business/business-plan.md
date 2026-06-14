# Warden: Business Plan

*The autonomous on-call engineer for founders who can't read code.*

Grounded in the repo ([plan.md](../product/plan.md), [README.md](../../README.md), [audit.md](../product/audit.md), [architecture.md](../product/architecture.md), [go-live.md](../operations/go-live.md)) and the 2026 competitive landscape. Today: 2026-05-30. Deliberately lean and bootstrapped: roughly a month of runway focuses the work on closing the core loop, not gold-plating it. The AWS+Vercel "H0" hackathon (due Jun 29, 5pm PDT) is a launch ramp, not the goal.

---

## 1. The bet, in 5 bullets

1. **There is uncontested white space below the entire AI-SRE category.** Every funded competitor (Cleric, Resolve.ai, which reportedly raised around $125M, Traversal, Datadog Bits, Sentry Seer) sells *investigation* or *PR-drafting* to people who can read code. Nobody serves the founder who **can't read the diff** and has no engineer to read it for them. The current "competitor" for that buyer is a **roughly $30 Fiverr/Upwork human** who manually fixes your Lovable/Bolt/Replit app. Warden is the productized, always-on, auditable replacement for that human.

2. **Trust comes from verification + reversibility + consent, not code review.** The buyer can't vet a patch, so the product is a *control plane*: a verification gate (tests pass, the error stops reproducing on a preview, no new errors) + one-tap revert + a human consent gate. This is the one thing every incumbent won't serve to ship to non-readers, because "a developer reviews the PR" *is* their safety story.

3. **The moat and the biggest opportunity are the same axis: verification depth.** Today, on our *exact* ICP's app (Sentry-connected, zero tests, no repro script), live mode **safely escalates to a human, pending the live verification harness**. The "it fixed it while you slept" promise is proven end-to-end in simulation; extending it to arbitrary live incidents (repro-from-stack-trace + smoke-test generation + error-rate diff) *is* both the roadmap and the durable IP.

4. **Cheap inference makes a low-value-per-incident business profitable, but tokens are not the COGS floor.** DeepSeek/GLM put LLM cost at pennies/incident; the real per-incident cost is **verification compute + the Aurora ACU floor**. All-in COGS is **~$0.20–0.90/incident**, supporting **~90% gross margin bundled, ~96% on bring-your-own-key**. **50 paying Team accounts ≈ $20K MRR.** A real bootstrapped business, not a token-burn trap.

5. **Position on the non-technical founder; monetize on the team they become.** The ICP-A founder (can't read the diff) is the uncontested narrative and free PLG funnel; but has the worst willingness-to-pay, worst churn, and near-zero incident volume. The *revenue* lives in ICP-B (seed/early dev teams with no on-call) that surviving ICP-A apps **graduate into**. Win the story on A; bill on the A→B graduation.

---

## 2. Positioning & category

**Category to claim:** *Autonomous on-call / self-healing for non-technical builders*; an **AI maintenance engineer for vibe-coded apps**, framed as a trust/control-plane product. **Not** an "AI-SRE" (don't get benchmarked on RCA accuracy your buyer can't evaluate) and **not** "a cheaper Devin."

**One-sentence narrative:** *Warden is the autonomous on-call engineer for founders who can't read code; it catches a production error, fixes it, proves the fix on a preview, and texts you one tap to ship or revert; trust comes from verification and reversibility, not from you reviewing a diff you couldn't read anyway.*

The market lumps three categories together. Warden competes with parts of each and belongs to none:

| Category | Representative players | Buyer | Remediation ceiling | Why it's not Warden's buyer |
|---|---|---|---|---|
| **AI-SRE / autonomous investigation** | Cleric (observe + recommend, **read-only by design**); Resolve.ai (targets high autonomy, F500, **reportedly raised ~$125M**); Traversal (reportedly high RCA accuracy, recommendations only); Datadog Bits (**reportedly around $500 / ~20 conclusive investigations/mo**); PagerDuty/incident.io/New Relic | SRE teams at mid-large orgs | Investigation + draft; human-in-the-loop | Enterprise-priced, SRE-operated; the ICP has no SRE, no observability budget, no one to read the RCA |
| **Coding agents** | Devin (**reportedly around $20/mo plus per-ACU usage**); Cursor / Claude Code / Copilot | Developers | PR-first; no consent/verify/revert contract | Assumes a developer reviews the PR. The ICP reaches for these and gives up ("Founders Build, Devs Fix") |
| **Incident-first autofix** ← our real competitor | **Sentry Seer**: error → RCA → drafted PR in a few minutes | Developers | **Opens a reviewable PR; a human still clicks merge. Does NOT auto-merge/deploy** | Priced at **reportedly around $40 per active contributor/mo** (active defined as multiple PRs): a definition the ICP can't even satisfy |

**Precise framing vs each:**
- **vs Sentry Seer:** "Seer writes a PR for your developer. You don't have a developer. Warden tests the fix on a preview and texts you one tap to ship, and one tap to undo." ([Seer GA](https://blog.sentry.io/seer-sentrys-ai-debugger-is-generally-available/), [Seer won't auto-create/merge](https://docs.sentry.io/product/ai-in-sentry/seer/autofix/))
- **vs Cleric/Resolve/Traversal:** "They're an AI co-pilot for an SRE team. You *are* the SRE team, except you can't read code." ([Resolve.ai raise](https://www.pymnts.com/news/investment-tracker/2026/resolve-ai-raises-125-million-for-ai-agents-that-maintain-software/), [Cleric](https://cleric.ai/))
- **vs Devin/Cursor/Claude Code:** "Coding agents fix code for engineers and assume someone reviews the PR. Warden starts from a real production error, proves the fix reproducibly, and never ships without your consent or instant revert." ([Devin pricing](https://costbench.com/software/ai-coding-assistants/devin-ai/))
- **vs the Fiverr/Upwork $30 human:** "Same job, fix my broken Lovable/Bolt app, but always-on, in minutes, with a full audit trail and memory that gets smarter every incident." ([Upwork: fix Bolt/Lovable/Replit](https://www.upwork.com/services/product/development-it-fix-and-deploy-your-bolt-lovable-or-replit-generated-app-to-production-2039748386706369776))

**The structural defense against platform encroachment** (Sentry adds "auto-merge for high-confidence fixes"; Vercel/Lovable add a native "Fix it" button; the real existential threat, since they own the funnel): be the **vendor-neutral control plane**: Sentry is one pluggable error source among many (Vercel logs, uptime, CI, user reports), any host, any model. A single-vendor incumbent won't build cross-vendor neutrality, and absorbing Warden would mean abandoning the developer-reviews-the-PR model that is their entire safety story. Win the founder ICP's trust before platforms notice the segment exists.

---

## 3. ICP & why-now

**The reconciliation (this is a decision, not a seam):** *Position and differentiate on ICP-A; monetize across the A→B graduation.* [plan.md](../product/plan.md) §1 bets everything on A. The evidence forces a split: the differentiation is most defensible on A, but the *billable business* lives on B.

| | (A) Solo / non-technical vibe-coders | **(B) Seed/early dev teams, no on-call** ⭐ revenue | (C) Mid-market eng orgs |
|---|---|---|---|
| **Role** | Narrative + free PLG funnel + demo logos | **The wedge you can bill within a month** | Expansion target, *not* a wedge |
| **Pain** | High emotionally, **low frequency** (low-traffic apps rarely fire) | High and **recurring**: real traffic = real incidents; 3am pages are a daily, funded pain | High but partially solved (they have on-call + Datadog + an SRE) |
| **Differentiation fit** | **Uniquely defensible**: they *literally cannot read the diff*, so verify-not-review is the *only* model | Strong but softer; "save the human review," not "replace it" | Weakest: they trust their own reviewers; "not invented here" + procurement |
| **WTP / ACV** | Worst; $0–600/yr (they chose v0 *to avoid* paying for engineering) | **Good; $2.4K–9.6K/yr**: a $200–500/mo "on-call you don't have" beats hiring a full-time SRE (well into six figures) | Best per-account; $15K–60K+/yr but long cycle |
| **Sales motion** | Pure self-serve PLG | **Low-touch PLG → founder-led** (Slack/YC communities, Show HN): *executable solo* | Outbound + SOC2 + security review; **not solo-feasible in a month** |
| **Churn / volume** | Brutal churn (most apps die in weeks); near-zero incident volume → outcome pricing ≈ $0 | Lower churn (the app is the company); healthy incident volume → per-fix billing is meaningful | Lowest churn, slowest to land |

**The expansion path you ride:** (A) free tier → funnel + viral "watch it fix a real bug" demo + logos → surviving (A) apps **become** (B) → land-and-expand within (B) as teams grow → (C) once you have SOC2, case studies, and a non-solo team.

**Why now (externally validated):**
- Vibe-coded apps are flooding production with no maintainer: by some measures **a large share (roughly half) of AI-generated code ships with security flaws**, industry analyses report **AI-authored PRs carry meaningfully more vulnerabilities (on the order of 2x)**, and CVEs attributed to AI code rose sharply through early 2026. ([Founders Build, Devs Fix](https://dev.to/konst_/founders-build-devs-fix-the-reality-of-vibe-coding-tools-in-2026-3o5))
- **A widely reported 2026 breach** of an AI-built app, whose founder reportedly "didn't write one line of code," leaked a large trove of API tokens and user emails through a client-side database key; the canonical "no human can read this codebase" disaster.
- Lovable/Bolt/Replit/v0 funnel non-technical founders to production with RLS misconfigs, Stripe double-charges, Safari-only bugs, and no one to fix them.
- Inference got cheap enough (DeepSeek/GLM) that closing the loop on *low-value-per-incident* customers is finally viable-margin; incumbents priced for enterprise can't profitably reach down here.

---

## 4. Product & the moat

The product is the orchestration + safety model + database, not any single integration. The state machine (`detected → triaging → investigating → fix_proposed → under_review → verifying → awaiting_approval → approved → deploying → verifying_prod → resolved | rolled_back | escalated`) has **no legal path to `deploying` that skips verification and a human `approvals` row.** Every transition writes an append-only `events` row.

### The four candidate moats, ranked by real defensibility

| # | Candidate | Defensibility | Status in the code |
|---|---|---|---|
| **1** | **Verification depth** (reproduce arbitrary prod errors; generate tests for test-less apps) | **Highest**: hard IP, gates the whole promise, hardest to copy | **Stub in live**: coincides with the biggest gap |
| **2** | **Outcome flywheel** (incident → fix → verdict → outcome → memory + scorecards, cross-customer patterns) | **Real but latent**: compounds with usage *if the loop closes* | **Write-only today**: collected, not consumed |
| 3 | Trust/safety model (verify-not-review + consent + reversibility) | Medium: the wedge and brand, copyable in a sprint | Built and sound (sim) |
| 4 | Vendor-neutral control plane | **Low as a moat**: good architecture and a sales story, not a barrier | Built and clean |

Moats #3 and #4 win the first customers; **#1 and #2 are the only things that keep you ahead once a well-funded incumbent notices.**

### Moat #1: verification depth IS the roadmap (the central insight)

What the live gate actually does today: `reproduce()` is wired only to the seeded sim bug catalog (AUDIT **C2**) → a real Sentry incident has no repro → `error_recurred` escalates; `runTests()` correctly fails closed on **0 tests collected** (AUDIT **H1/H5**), and most vibe-coded apps have no tests; `new_errors` is hardcoded `[]` (H4) and `verifyProdHealth()` is fail-closed (L2). **Net: in live mode today the "verification gate" degrades to "escalate everything to a human."** *The "it fixed it while you slept" promise currently only fully fires in the demo.*

The verification roadmap (hardest-first, this is the IP):
1. **Repro-from-stack-trace**: synthesize a failing reproduction from the Sentry event (failing request/payload + stack frame) so `error_recurred` becomes a real signal on arbitrary incidents. Single highest-IP component.
2. **Smoke-test generation for test-less repos**: generate a minimal test exercising the culprit path, turning the ICP's biggest weakness into Warden's value.
3. **New-error / error-rate diff** post-preview and post-promote (Sentry/Vercel) to populate `new_errors`, make `verifyProdHealth` real, and enable autonomous resolve **and** auto-rollback.

### Moat #2: close the flywheel (collected, not consumed)

The data substrate is good: `incidents.embedding` (pgvector HNSW), `agent_scorecard`, append-only `events`, plus the per-incident artifacts. But `bumpScorecard` *writes* win/regression counters that `getFixer`/`getReviewers` **never read** (the scorecard is a ledger, not a router), and pgvector logs "seen before" without retrieving the prior accepted fix. To make it bite: **route by scorecard** (pick Fixer/panel by win-rate per error-class), **retrieval-augment the Fixer** (inject the last accepted diff + verdict on a vector match), and **learn cross-customer patterns on outcomes, not source** (`error-class → fix-class → verdict → prod-outcome`) to sidestep code-leak/privacy. Cold-start honesty: thin at customer #1, compounding into a real moat at fleet scale.

### Code-graph context: right instinct, #2 priority

The instinct that single-file context is too thin is correct: the Fixer reads only the one culprit file; the reviewer sees only the diff + `fileHistory`. An **Aider-style tree-sitter ranked repo-map / SCIP symbol graph** that resolves the stack trace to the real call graph is the strongest lever for *fix quality* and expands auto-handleable bug classes. **But sequence it below verification:** fix quality raises the escalation rate you can auto-handle; it does **not** unblock live autonomy, because the binding constraint is verification, not the patch; a better fix you can't verify hits the same wall. Run it as a *parallel accuracy track*. (Caveat: for the Jun 29 *demo*, judges see the fix, not the verifier internals; weighting the accuracy story slightly higher for the video is defensible.)

### The rest of the production roadmap (grounded in the code)
- **Durable worker host**: `lib/repo/jobs.ts` already has `FOR UPDATE SKIP LOCKED`, lease heartbeat, ownership-scoped complete/fail, backoff, `reclaimStale`. Missing is an always-on box (Fly/Railway/ECS/tiny EC2) running `npm run worker`; keep `/api/orchestrator/tick` cron as fallback. Low risk.
- **GitHub App (load-bearing for trust, AUDIT C1)**: push the fix branch + set `VERCEL_REPO_ID` so Vercel builds the exact verified SHA; assert built SHA == `fix_attempts.commit_sha` before promote. "Ship the exact bytes you verified" is a correctness requirement.
- **Sandboxed verification (go-live blocker)**: the worker runs untrusted customer code (`scripts/reproduce.js`, `node --test`) via `execFile`. Multi-tenant live needs ephemeral, egress-restricted, resource-capped containers (gVisor/Firecracker/one-shot Fargate). Not a v2.
- **Multi-tenant auth + isolation**: add `tenants`/`projects`, `tenant_id` on every row + Postgres RLS, per-tenant credential vaulting (deploy creds never reach the model; already enforced), approver identity from an authenticated session.
- **Conservative fix-class expansion**: start where reproduction is deterministic (null/undefined deref, missing env/config, type coercion, off-by-one in a pure function). **Never widen the fix surface faster than the verification surface.** Data mutations stay human-only.

---

## 5. Pricing & unit economics

**Three non-negotiable design rules:**
1. **Bill the right event.** Charge only on **approved → deployed → NOT reverted within 24h.** The consent tap *and* the one-tap revert both gate billing. Never bill on "agent produced a verified fix."
2. **Coverage > fixes as the headline.** "We're on-call 24/7; paid even when it's quiet" is the insurance premium; the per-fix fee is the claim payout. Pure pay-per-fix gives a healthy account ≈ $0 ACV.
3. **Free tier = diagnosis-only.** Verification burns real compute on every incident, so unlimited free verification is a COGS *liability*. Free observes and explains; it never deploys a preview.

| Tier | Price | Who | Included | COGS posture |
|---|---|---|---|---|
| **Watch (free PLG)** | $0 | Vibe-coders (A), trials | **Diagnosis only**: detect, investigate, readable root cause. No preview deploy, no panel | Verification capped to $0 |
| **Solo** | **$49/mo** | Surviving solo apps | 1 app + **3 shipped-fixes/mo**, then $19/fix | Bundled inference; hard per-incident cap |
| **Team** ⭐ | **$199/mo + $15–30/shipped-fix** | **Wedge (B)** | 24/7 coverage, **panel of 3** reviewers, preview verify, one-tap ship/revert, audit + memory | Retainer covers Aurora floor; outcome fee covers verification compute |
| **Team BYO-key** | **$149/mo flat** | Cost-conscious (B) | Same product, they pay inference | **~95%+ margin**, immune to a provider yanking a free tier |
| **Scale / Enterprise** | Custom ($1.5K–5K+/mo) | (C) expansion | SSO, SOC2, multi-repo, SLAs, on-prem keys | Negotiated |

**Price anchor:** Sentry Seer is **$40/active-contributor/mo** and *requires a developer to review the PR* ([Seer pricing, Jan 2026](https://sentry.zendesk.com/hc/en-us/articles/45551407771931-What-is-the-pricing-for-Seer-January-21-2026)). Warden sells to the team with **nobody to do that review**, so a $199/team retainer that *removes* the review step is defensible at or above Seer's effective per-team cost.

### Unit economics: tokens are NOT the COGS floor

Per-incident, on paid DeepSeek ($0.14/$0.28 per M tokens, *not* the promo/cache rate):

| Cost component | Estimate |
|---|---|
| Fixer tokens (1 call, ~10–30K ctx + output) | ~$0.005–0.02 |
| Reviewer **panel of 3** (×~10–30K ctx each) | ~$0.015–0.06 |
| Investigator + embeddings (pgvector memory) | ~$0.002–0.01 |
| **LLM subtotal** (over-focused on, it's noise) | **~$0.02–0.09** |
| **Verification compute** (preview build + test run + reproduction): *the real driver* | **~$0.10–0.50** |
| **Aurora Serverless v2** amortized (ACU **floor ~$45–90/mo fixed**) | **~$0.05–0.30** |
| **All-in COGS / incident** | **~$0.20–0.90** |

**Margin at the wedge** (Team plan, ~8 shipped-fixes/mo, ~20 incidents processed): Revenue ≈ $199 + 8×$25 = **~$399/mo**; COGS ≈ 20×$0.55 + ~$30 Aurora share ≈ **~$41/mo** → **gross margin ≈ 90% bundled, ~96% BYO-key.** **50 paying Team accounts ≈ $20K MRR at ~90% margin.** Engineer down **verification compute per incident** (reuse preview builds, scope test runs, cache repo-maps per commit) and **Aurora ACU at idle** (scale-to-zero, shared tenancy). Treat GLM-free as upside, never the base case.

*Sources: [DeepSeek pricing $0.14/$0.28](https://api-docs.deepseek.com/quick_start/pricing).*

---

## 6. The 1-month plan (May 30 → Jun 29)

**The codebase is past most people's *finished* hackathon projects** (M0–M12, 79 tests green, panel reviewer, one-tap revert, audit trail, pgvector memory, scorecard, cheap-provider support). The verify-not-review loop is built and verified end-to-end in simulation; **the entire remaining job is crossing sim→live on ONE real case and packaging it. Do not re-build M0–M12.** The single riskiest thing is that the loop has not yet run against live credentials, and three load-bearing legs are written and fail-closed, pending live credentials to validate them.

| Week | Focus | Concrete deliverables | Success gate |
|---|---|---|---|
| **W1 (May 30–Jun 5)** | **Provision + tracer bullet + open the slow clocks** | **A:** Deploy `sample-app/` to Vercel with real Sentry; provision **Aurora Serverless v2** (0.5–2 ACU), `CREATE EXTENSION vector`, `npm run migrate`; **capture the storage screenshot now**; set `WARDEN_MODE=live` + DeepSeek/GLM keys; validate live fixer patch-apply + reviewer JSON. **B:** Push to GitHub → import to Vercel → note prod URL + Team ID; wire `/api/orchestrator/tick` cron. **C:** Ship landing + waitlist; start **3–5 design-partner outreach**. | Loop runs and *breaks at a known leg* (repro / deploy-parity), documented |
| **W2 (Jun 6–Jun 12)** | **Close the loop; make the gate bite** | **Reproduction harness** (replay the failing Sentry request against the preview so `error_recurred` is real): scoped to ONE bug class. **Deploy parity** (`git push` branch, set `VERCEL_REPO_ID`, assert built SHA == `fix_attempts.commit_sha`). **Pin the target to a repo that HAS tests.** | 🎯 **≥1 real Sentry error → auto-fixed → verified on preview → human-approved → shipped → recorded in Aurora**, AND the panel **correctly escalates ≥1 intentionally bad fix**. If false by ~Jun 12, cut scope |
| **W3 (Jun 13–Jun 19)** | **Multi-tenant-lite, partners on, hardening** | `tenant_id` FK + scoped queries behind the existing `WARDEN_API_SECRET` (**no Auth.js/RBAC**). Onboard 1–2 design partners on a connected repo (NOT the demo critical path). **Cost instrumentation** (token spend/incident). Run the loop 10× on injected bugs; fix flakiness under real Vercel latency. | Loop survives >1 user; cost/incident proven in single-digit cents |
| **W4 (Jun 20–Jun 26)** | **Freeze, polish, package** | **Freeze the demo ~Jun 24.** Record the ~3-min video (PLAN §14). Submission package: name **Amazon Aurora PostgreSQL Serverless v2**; Vercel link + Team ID; architecture diagram (export existing mermaid); Aurora screenshot. | **Submit Jun 27–28** (buffer), not Jun 29 |

**What to cut (explicit):** code-graph/repo-map (quality lever, not blocker; post-Jun 29); real auth/identity (`tenant_id` + shared secret is the floor); smoke-test generation (sidestep by picking a target *with* tests); non-Sentry sources, non-Vercel hosts, data-mutation fixes; multiple demo bug classes (one bulletproof beats five flaky). **The sequencing trap:** treating business seeds + provisioning as Week-4 work; partner replies and account approvals are clocks you don't control. The code-graph is deliberately deprioritized: it would consume runway without advancing whether the core loop closes, the binding constraint that gates everything else.

---

## 7. Risks & mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| **R1: Autonomy / liability** (one bad fix ships) | Trust is asymmetric: 100 good fixes don't offset one checkout-corrupting ship | Designed-in: human gate is **consent, not correctness** (PLAN §5.2), no standing deploy authority, mandatory one-tap rollback, conservative scope. **Make the shield contractual:** codify §5.2 in ToS ("you authorize each deploy; we provide verification + reversibility, not a correctness warranty"), carry small E&O insurance before the first paying customer. Keep data mutations human-only with dry-run + Aurora snapshot, never cross that line |
| **R2: Verification depth** (THE core technical risk) | Today an incident on the ICP's app (no tests, no repro) **escalates instead of auto-fixing**: autonomous-resolution rate ≈ 0 in live | Build the live verification harness (repro-from-event → smoke-test gen → error-rate diff). **#1 engineering priority, above the repo-map.** A great fix that always escalates is not a product |
| **R3: Incumbent response** | Sentry could add auto-merge; the bigger threat is the **app builders** (v0/Lovable/Bolt) adding a native "Fix it" button | Seer is dev-in-the-loop (pricing unit = active *contributors*); the funded field races up-market, leaving no-engineer uncontested. **Be the vendor-neutral control plane; partner before they build**: be the recommended "Devs Fix" integration |
| **R4: Unit economics on a free tier** | A free "auto-fix everything" tier invites burning verification compute + Aurora ACU | **Never offer unmetered auto-fix** (free = diagnosis-only); rate-limit incidents/app, auto-pause Aurora, hard per-tenant spend ceiling, push to BYO-key |
| **R5: Data/security trust** ("you want my prod errors + repo + deploy keys?") | A huge ask for a nervous solo founder | Mostly done: read-only DB role, **deploy creds never reach the model**, TLS-by-default, SSRF guards, fail-closed mutation classifier, signature verification, append-only audit log. **Turn it into a sales asset:** publish a one-page trust posture. Add sandboxed/egress-restricted verification before multi-tenant live |

---

## 8. GTM & distribution

**Launch motion (sequenced):**
1. **Hackathon (Jun 29) = forcing function + free ecosystem placement**, not the goal. The real prize is the first public "it shipped a fix while I slept" proof.
2. **5–10 design partners, the only thing that matters in June/July.** Solo/non-technical founders with a live Sentry-connected v0/Lovable app; onboard white-glove. The conversion event is visceral: *"connect your Sentry, then watch Warden catch and fix a real bug."* Each becomes a case study + referral.
3. **PLG via the "watch it fix a real bug" demo.** Activation metric = **time-to-first-verified-fix**: the aha is the first push, not signup.
4. **Founder-led sales up the ladder** → tiny teams and agencies who ship vibe-coded apps for clients; the path off the thin-wallet floor.

**Distribution bets, ranked by use:**
1. **Become an integration/template inside the app builders** (v0, Lovable, Bolt, Replit); be the **"Devs Fix" button**: pursue marketplace listings *before* they build it.
2. **AWS + Vercel ecosystem** (the hackathon's gift); Vercel marketplace, "built on Aurora Serverless v2" co-marketing, AWS reference-architecture content.
3. **Content / POV around "verify-not-review"**: own the contrarian thesis publicly, paired with sanitized public "fix logs."
4. **Indie communities** + a public scorecard ("N fixes autonomously verified; revert rate X%").

**What NOT to do:** don't chase enterprise SRE; don't compete with Sentry on monitoring; ride on top of it, vendor-neutral.

---

## 9. The 6–12 month vision

**Thesis:** Warden becomes the **autonomous operations layer for software built by people who don't read code**: the standing "on-call engineer you don't have" for the millions of AI-built apps hitting the production "Technical Cliff."

- **Months 0–3 (now → Aug):** Live path working; the repro + smoke-test harness makes *autonomous resolution real on test-less apps*; 5–10 design partners; first public autonomous-fix proof.
- **Months 3–6:** Self-serve PLG; first paying solo founders graduating into Team plans; the **code-graph/repo-map context provider** lands as the *fix-quality* lever (after the harness makes the gate fire); pgvector memory + scorecard start to compound.
- **Months 6–12:** Expand the pluggable surfaces; more **error sources** (uptime, CI, user-report, Vercel logs), more **model adapters** (cheap for triage, frontier for hard fixes), more **deploy targets**; move up to tiny teams + agencies; pursue SOC2 Type II once a partner requires it (the append-only audit log means the hardest part is built).

**The category claim if it works:** not "a better debugger" and not "AI-SRE for enterprises," but **"the control plane that lets non-engineers run production software safely"**: Stripe-for-payments-style infrastructure, but for *keeping an app alive*.

---

## 10. The PMF metrics (3–5 that prove the thesis)

| # | Metric | What it proves | Target signal |
|---|---|---|---|
| **1** | **Approval rate on auto-fixes** (% of `awaiting_approval` the founder taps Approve) | *Trust*: would a non-technical founder ship what Warden proposes? | **>70% sustained** |
| **2** | **Autonomous-resolution rate** (% of incidents reaching `awaiting_approval` WITHOUT escalating) | *Product quality / the R2 gap*: does the gate fire on real test-less apps? | **Rising from ~0 toward 50%+** |
| **3** | **Post-ship revert rate** (% of shipped fixes reverted / auto-rolled-back) | *Safety*: is reversibility a rare backstop or a crutch? | **<5%** (spiking = stop expanding scope) |
| **4** | **Time-to-first-verified-fix** (signup → first "I found a verified fix" push) | *Activation*: the aha moment + PLG engine | **< a few days** |
| **5** | **Weekly retained active apps + free→paid conversion** | *Durable value* | Retention + paying = PMF |

**The diagnostic pairing is the point:** Metric 1 high + Metric 2 low = a *trusted tool that rarely fires* (build the harness, R2). Metric 2 high + Metric 1 low = a *busy tool nobody trusts* (improve verification depth / explanations). **You need both high simultaneously; that conjunction is PMF.** Revert rate (3) is the kill-switch.

---

*Synthesized from a 6-agent research workflow (live 2026 market research + repo-grounded analysis). Companion to [plan.md](../product/plan.md) (the build spec) and [go-live.md](../operations/go-live.md) (the deploy checklist).*
