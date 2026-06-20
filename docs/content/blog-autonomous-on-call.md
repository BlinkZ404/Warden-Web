# I built an autonomous on-call engineer for people who can't read code

I keep meeting the same founder. They shipped an app with v0 or Cursor or Claude Code, it has real users, and they cannot read a single line of the code that runs their company. When something breaks at 2am, they have three bad options: a monitoring tool that tells them it's broken but won't fix it, a coding agent that opens a pull request *they can't review*, or a cheap stranger on a freelance marketplace. Nothing actually closes the loop.

So I built **Warden**: an autonomous on-call engineer for the founder who can't read the diff. A production error fires, it investigates, an AI writes a patch on a branch, a panel of independent reviewer agents cross-checks it, a verification gate runs the app's real tests and reproduces the original error on a preview, and then the founder gets a readable push notification: one tap to ship, one tap to revert. The whole thing runs end-to-end today in simulation mode, against a real Postgres, with 102 tests green.

## The insight: verify, don't review

Every incumbent in this space has the same safety story: *a developer reviews the pull request.* That's a fine story; unless your buyer has no developer. The moment you accept "the human can't read the code," the entire trust model has to change.

Warden's answer is **verify-not-review**. Trust doesn't come from a human vetting the patch. It comes from three things the founder *can* evaluate without reading code:

1. **Deterministic verification**: the app's real test suite passes, the original error no longer reproduces on a preview deploy, and no new error signatures appear.
2. **Reversibility**: every production change has a one-tap rollback (Vercel instant rollback), so the cost of a wrong call is bounded and cheap.
3. **A human consent gate**: nothing ships without the founder tapping Approve, and that tap means *"I consent to ship this,"* not *"I read and approved the code."* Consent, not correctness.

This distinction is the whole product. The verification gate is the real safety net. The human is there to consent and to own the decision, not to catch bugs they couldn't see anyway.

## The multi-model reviewer panel

Before anything reaches the gate, the fix goes through a panel of up to three independent reviewer agents, intentionally from **different model families**. One Fixer proposes, the panel cross-checks the diff and the git history: is the patch tightly scoped? Does it actually touch the file the error implicates? Does it spray across unrelated files? Does it collide with code that just changed?

The subtle part is what agreement *means*. Multiple agents agreeing is a **correlated, weak signal**: three models trained on similar data can be confidently wrong together. So in Warden, agreement is only a *filter*. Disagreement escalates to the human ("don't auto-handle this"), and agreement never overrides a failed verification check. The panel narrows what's worth verifying. The gate decides what's safe to ship. I keep those two jobs strictly separate, because the day you let "both models said yes" override a failing test is the day you ship a checkout-corrupting bug.

## Built on Aurora + Vercel

The thing I'm proudest of is boring: **the database is the product.** Warden runs on Amazon Aurora PostgreSQL Serverless v2, and Aurora is doing four jobs at once:

- a **state machine**: `incidents.status` walks a strict enum (`detected → triaging → investigating → fix_proposed → under_review → verifying → awaiting_approval → approved → deploying → verifying_prod → resolved`), and there is *no legal path to `deploying` that skips verification and a human approval row*;
- an **append-only audit log**: every transition writes an `events` row, so "what happened and who decided it" is the source of truth, not a guess;
- **pgvector memory**: incident embeddings let the system recognize "we've seen this before";
- a **scorecard**: each agent's accuracy tracked over time.

The orchestrator itself is stateless and resumable: on restart it reads the current state from Aurora and continues. The front end (a dark "ops console" dashboard plus a mobile approval PWA) is Next.js on Vercel, reading state straight from Aurora. The same Vercel that hosts the UI is the deploy target: preview → verify → promote → rollback.

## Running it on cheap models

A loop that fires on every production error can't cost $5 an incident. So every agent sits behind a vendor-neutral, OpenAI-compatible provider layer: base URL + key + model, nothing more. That means I can run the Fixer and the reviewer panel on **DeepSeek (pennies per million tokens)** or even **GLM's free tier**, and mix families across the panel with three env vars. LLM cost per incident lands around two to nine cents. The real cost driver isn't tokens at all: it's verification compute and the Aurora floor. Cheap inference is what makes serving a low-value-per-incident customer actually profitable instead of a token-burn trap.

## The honest hard part

Here's the honest boundary: **verification depth is both the moat and the deliberate sim-to-live frontier.** The verify-not-review loop is built and verified end-to-end in simulation, so the gate already fires reliably there. Point it at a real vibe-coded app (Sentry-connected, *zero tests, no reproduction script*) and the live adapters are written and fail-closed: the gate correctly escalates everything to the human, safely, pending the live verification harness. "It fixed it while you slept" runs fully today in simulation, and lighting it up on live apps (reproducing arbitrary errors from a stack trace, generating smoke tests for test-less repos, diffing error rates after deploy) is the next milestone on the roadmap, and the hardest IP in the whole system. I'd rather tell you exactly where that boundary sits than oversell the loop.

If you've ever shipped an app you can't debug and felt that 2am dread, this is for you. **Connect your Sentry, then watch it catch and fix a real bug.** That's the whole pitch, and the demo speaks louder than I can.
