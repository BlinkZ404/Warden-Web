import Link from "next/link";
import type { Metadata } from "next";
import { Wordmark } from "../_components/wordmark";
import { SectionNav } from "./section-nav";

export const metadata: Metadata = {
 title: "Docs",
 description:
 "How Warden works: the incident pipeline, the verification gate, the reviewer panel, the Aurora-backed architecture, run modes, and going live.",
};

/* Sidebar entries. Each id matches a <Section> below so the anchor links land. */
const NAV: { id: string; label: string }[] = [
 { id: "overview", label: "Overview" },
 { id: "how-it-works", label: "How it works" },
 { id: "lifecycle", label: "Incident lifecycle" },
 { id: "reviewer-panel", label: "Reviewer panel" },
 { id: "verification-gate", label: "Verification gate" },
 { id: "architecture", label: "Architecture" },
 { id: "run-modes", label: "Run modes" },
 { id: "going-live", label: "Going live" },
 { id: "faq", label: "FAQ" },
];

// The legal happy-path states of an incident (lib/statemachine/transitions.ts).
const STATES = [
 "detected",
 "triaging",
 "investigating",
 "fix_proposed",
 "under_review",
 "verifying",
 "awaiting_approval",
 "approved",
 "deploying",
 "verifying_prod",
 "resolved",
];

const PIPELINE = [
 {
 step: "Detect",
 body: "An error fires in production. Warden picks it up from a signature-verified Sentry webhook and de-duplicates it by fingerprint, so a thousand identical crashes are one incident.",
 },
 {
 step: "Investigate",
 body: "An agent reads the error, the stack, and the surrounding code through a read-only database role. It can look, never touch. Low confidence escalates to a human instead of guessing.",
 },
 {
 step: "Fix",
 body: "A Fixer writes a patch on a branch. It has no merge rights, no deploy authority, and never sees your deploy credentials.",
 },
 {
 step: "Review",
 body: "A panel of independent reviewer agents cross-checks the patch against the diff and the file's git history: is it tightly scoped, does it touch the file the error implicates, does it collide with code that just changed?",
 },
 {
 step: "Verify",
 body: "The reviewers establish the fix is correct; this gate proves it is safe to ship. Warden runs the target's existing test suite as a regression check, replays the exact failing request to confirm the original error is gone, and watches for new error signatures. A test that was passing and now fails blocks; a target with no suite proceeds on the reviewers' verdict. Deterministic, and the real safety net.",
 },
 {
 step: "Approve",
 body: "Only once the tests pass and the crash is gone do you get a plain-English push notification with two buttons: ship it, or don't. The tap is consent to ship, not a code review.",
 },
 {
 step: "Deploy and watch",
 body: "On approval Warden promotes the fix and watches production health. If the error rate spikes after deploy, it rolls itself back without asking. Every change is one tap to revert.",
 },
];

const RUN_MODES = [
 { cap: "Error source", sim: "Synthetic Sentry events", live: "Real Sentry webhook + HMAC verify" },
 { cap: "Fixer / Reviewer", sim: "Deterministic, real git edits + real diff analysis", live: "Anthropic / OpenAI (any OpenAI-compatible provider)" },
 { cap: "Embeddings", sim: "Local hashing vectorizer (deterministic)", live: "Embeddings API" },
 { cap: "Deploy / rollback", sim: "Recorded, plausible URLs", live: "Vercel API" },
 { cap: "Push delivery", sim: "Recorded as a notification event", live: "Web push (VAPID)" },
 { cap: "Verification gate", sim: "REAL: regression tests + request replay", live: "REAL", emphasis: true },
];

const FAQ = [
 {
 q: "Do I need to read the code?",
 a: "No. Warden is built for founders who cannot read a diff. Trust comes from the verification gate, the one-tap rollback, and your consent tap, not from you vetting the patch.",
 },
 {
 q: "What if the fix is wrong?",
 a: "Nothing ships without passing the deterministic gate and your approval. Every production change is reversible with one tap, and Warden auto-rolls-back on a post-deploy error spike, so the cost of a wrong call is bounded and cheap.",
 },
 {
 q: "What does it run on?",
 a: "Amazon Aurora PostgreSQL Serverless v2 with pgvector for everything stateful, and Next.js on Vercel for the dashboard and the mobile approval screen. Vercel is also the deploy and rollback target.",
 },
 {
 q: "Which models does it use?",
 a: "The agents sit behind a vendor-neutral, OpenAI-compatible provider layer (base URL, key, model). You can run the Fixer and the reviewer panel on different model families, including cheap or free tiers, with a few settings.",
 },
 {
 q: "Is it live yet?",
 a: "The full loop runs end to end today in simulation against a real Postgres, with the safety-critical verification gate real in both modes. The live adapters are written to fail closed: when they hit something they cannot yet verify, they escalate to a human instead of guessing.",
 },
];

export default function DocsPage() {
 return (
 <main className="min-h-screen bg-[var(--color-ink)] text-[var(--color-text)]">
 {/* header: matches the landing, links back home */}
 <header className="sticky top-0 z-30 border-b border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-ink)_82%,transparent)] backdrop-blur-md">
 <div className="mx-auto flex max-w-7xl items-stretch justify-between">
 <Link href="/" className="flex items-center gap-2.5 px-6 py-4 sm:px-8">
 <Wordmark />
 <span className="hidden items-center rounded-md border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_60%,transparent)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-brand-2)] sm:inline-flex">
 Docs
 </span>
 </Link>
 <div className="flex items-stretch">
 <Link
 href="/"
 className="flex items-center gap-2 border-l border-[var(--color-line)] px-4 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[color-mix(in_srgb,var(--color-panel)_60%,transparent)] hover:text-[var(--color-text)]"
 >
 <span aria-hidden>←</span> Home
 </Link>
 <Link
 href="/dashboard"
 className="group flex items-center gap-2 border-l border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-brand)_15%,transparent)] px-5 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[color-mix(in_srgb,var(--color-brand)_26%,transparent)]"
 >
 Try Warden
 <span aria-hidden className="text-[var(--color-brand-2)] transition group-hover:translate-x-0.5">
 →
 </span>
 </Link>
 </div>
 </div>
 </header>

 <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)]">
 {/* sticky in-page nav with scroll-spy */}
 <aside className="hidden border-r border-[var(--color-line)] lg:block">
 <SectionNav items={NAV} />
 </aside>

 {/* content */}
 <div className="px-6 py-12 sm:px-10 lg:px-14">
 <div className="mx-auto max-w-3xl">
 <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-brand-2)]">
 Documentation
 </p>
 <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
 The on-call engineer, explained
 </h1>
 <p className="mt-4 text-base leading-relaxed text-[var(--color-doc)]">
 Warden catches a production crash, writes the fix, proves it on a live preview, and
 waits for your one tap. This is how the loop works, what keeps it safe, and what it
 runs on.
 </p>

 <Section id="overview" title="Overview">
 <p>
 Warden is an autonomous on-call engineer for founders who ship AI-built apps and
 have no engineer to fix them when they break. When a production error fires, it
 investigates, writes a fix on a branch, has independent reviewer agents cross-check
 it, verifies the fix on a preview, and then asks you to ship with one tap.
 </p>
 <p>
 The core reframe is <strong className="text-[var(--color-text)]">verify, don&apos;t review</strong>.
 Every other tool in this space assumes a developer reads the pull request. The person
 Warden is built for cannot. So trust does not come from reading the patch. It comes
 from three things you can actually evaluate: deterministic verification, one-tap
 reversibility, and a single human consent gate.
 </p>
 <Callout>
 Warden is a control plane above commodity pieces (Sentry, Claude, OpenAI, Vercel).
 Those are pluggable adapters. The orchestration, the safety model, and the database
 are the product.
 </Callout>
 </Section>

 <Section id="how-it-works" title="How it works">
 <p>
 One production error walks through the whole pipeline on its own. Each stage has a
 strict, recorded handoff, and the loop can only move forward when the previous stage
 actually succeeded.
 </p>
 <ol className="mt-6 space-y-3">
 {PIPELINE.map((p, i) => (
 <li
 key={p.step}
 className="flex gap-4 rounded-lg border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_55%,transparent)] p-4"
 >
 <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[color-mix(in_srgb,var(--color-brand)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-brand)_16%,transparent)] font-mono text-xs font-semibold text-[var(--color-brand-2)]">
 {i + 1}
 </span>
 <div>
 <p className="text-sm font-semibold text-[var(--color-text)]">{p.step}</p>
 <p className="mt-1 text-sm leading-relaxed text-[var(--color-doc)]">{p.body}</p>
 </div>
 </li>
 ))}
 </ol>
 </Section>

 <Section id="lifecycle" title="Incident lifecycle">
 <p>
 Every incident is a row in Aurora whose <code className="wd-code">status</code> walks a
 strict state machine. Only legal transitions are allowed, and there is{" "}
 <strong className="text-[var(--color-text)]">no path to deploying that skips
 verification and a human approval row</strong>. The safety model is enforced in the
 schema, not in prose.
 </p>
 <div className="mt-6 flex flex-wrap items-center gap-x-1.5 gap-y-2">
 {STATES.map((s, i) => (
 <span key={s} className="flex items-center gap-1.5">
 <code className="wd-code">{s}</code>
 {i < STATES.length - 1 && (
 <span aria-hidden className="text-[var(--color-muted)]">
 →
 </span>
 )}
 </span>
 ))}
 </div>
 <p className="mt-6">
 Under review or verifying can also loop back to{" "}
 <code className="wd-code">fix_proposed</code>: an actionable rejection or a failed gate
 sends the fix back for a bounded retry (operator-tunable, default three attempts) before
 it gives up. Any stage can also branch to an off-ramp.{" "}
 <code className="wd-code">escalated</code> hands the incident to a human (low
 confidence, reviewer disagreement, or an exhausted retry budget).{" "}
 <code className="wd-code">dismissed</code> is a human rejecting the fix, and{" "}
 <code className="wd-code">rolled_back</code> is an automatic revert after a post-deploy
 error spike.
 </p>
 </Section>

 <Section id="reviewer-panel" title="The reviewer panel">
 <p>
 Before a fix reaches the gate, it goes through a panel of up to three independent
 reviewer agents, on purpose from different model families. One Fixer proposes; the
 panel cross-checks the diff and the git history.
 </p>
 <p>
 The subtle part is what agreement means. Several models agreeing is a correlated, weak
 signal, because models trained on similar data can be confidently wrong together. So in
 Warden, <strong className="text-[var(--color-text)]">agreement is only a filter</strong>.
 Disagreement escalates to a human, and agreement never overrides a failing verification
 check. The panel narrows down what is worth verifying. The gate decides what is safe to
 ship.
 </p>
 </Section>

 <Section id="verification-gate" title="The verification gate">
 <p>
 The reviewer panel establishes that the fix is correct; this deterministic gate then
 confirms it is safe to ship, and it stays real in both simulation and live mode. A fix
 clears the gate when:
 </p>
 <ul className="mt-5 space-y-3">
 {[
 ["Nothing regressed", "Warden runs the target's existing test suite against the patched code; a test that was passing and now fails blocks the fix. A target with no suite proceeds on the reviewers' verdict, never on a vacuous pass."],
 ["The original error is gone", "It replays the exact failing request that started the incident and confirms the patch stops it."],
 ["No new errors appeared", "It checks that the fix did not introduce a new error signature somewhere else."],
 ].map(([t, d]) => (
 <li key={t} className="flex gap-3 rounded-lg border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_55%,transparent)] p-4">
 <CheckGlyph />
 <div>
 <p className="text-sm font-semibold text-[var(--color-text)]">{t}</p>
 <p className="mt-1 text-sm leading-relaxed text-[var(--color-doc)]">{d}</p>
 </div>
 </li>
 ))}
 </ul>
 <p className="mt-6">
 If a check fails, Warden re-proposes the fix with the failure as feedback, bounded by a
 small attempt budget (operator-tunable, default three), and escalates to a human once
 the budget is spent rather than guessing. Agents have no standing deploy authority; only
 a human-written approval row moves an incident out of{" "}
 <code className="wd-code">awaiting_approval</code>.
 </p>
 </Section>

 <Section id="architecture" title="Architecture">
 <p>
 The thing Warden is proudest of is boring on purpose: the database is the product.
 Amazon Aurora PostgreSQL Serverless v2 does four jobs at once.
 </p>
 <div className="mt-6 overflow-hidden rounded-lg border border-[var(--color-line)]">
 <table className="w-full text-left text-sm">
 <thead className="bg-[color-mix(in_srgb,var(--color-panel)_70%,transparent)] text-[var(--color-muted)]">
 <tr>
 <th className="px-4 py-2.5 font-medium">Role</th>
 <th className="px-4 py-2.5 font-medium">What it stores</th>
 </tr>
 </thead>
 <tbody>
 {[
 ["State machine", "incidents.status (enum) plus the legal transitions"],
 ["Append-only audit log", "events: the source of truth for what happened and who decided it"],
 ["Vector memory", "incident embeddings in pgvector: have we seen this one before?"],
 ["Learning", "agent_scorecard: each agent's accuracy over time"],
 ].map(([role, what]) => (
 <tr key={role} className="border-t border-[var(--color-line)]">
 <td className="px-4 py-2.5 font-medium text-[var(--color-text)]">{role}</td>
 <td className="px-4 py-2.5 text-[var(--color-doc)]">{what}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 <p className="mt-6">
 The orchestrator itself is stateless and resumable. On restart it reads the current
 state out of Aurora and continues, so a crash mid-incident is a non-event. A lightweight
 job queue (Postgres <code className="wd-code">FOR UPDATE SKIP LOCKED</code>) drives it.
 </p>
 <p>
 A key-value store like DynamoDB could not do the relational state machine or the vector
 search, and splitting this across three services would mean three sources of truth for
 something that has to be exactly one. The front end is Next.js on Vercel: a dark ops
 console for showing the work, and a stripped-down mobile approval screen for the founder.
 The same Vercel that hosts the UI is the deploy and rollback target.
 </p>
 </Section>

 <Section id="run-modes" title="Run modes">
 <p>
 The principled line is simple: simulate what needs accounts and keys, and keep the
 safety-critical verification real. Each capability flips to live independently the moment
 its secret is present, so a half-configured environment still runs end to end.
 </p>
 <div className="mt-6 overflow-x-auto rounded-lg border border-[var(--color-line)]">
 <table className="w-full min-w-[640px] text-left text-sm">
 <thead className="bg-[color-mix(in_srgb,var(--color-panel)_70%,transparent)] text-[var(--color-muted)]">
 <tr>
 <th className="px-4 py-2.5 font-medium">Capability</th>
 <th className="px-4 py-2.5 font-medium">Simulation (default)</th>
 <th className="px-4 py-2.5 font-medium">Live</th>
 </tr>
 </thead>
 <tbody>
 {RUN_MODES.map((r) => (
 <tr
 key={r.cap}
 className={`border-t border-[var(--color-line)] ${r.emphasis ? "bg-[color-mix(in_srgb,var(--color-ok)_8%,transparent)]" : ""}`}
 >
 <td className="px-4 py-2.5 font-medium text-[var(--color-text)]">{r.cap}</td>
 <td className="px-4 py-2.5 text-[var(--color-doc)]">{r.sim}</td>
 <td className={`px-4 py-2.5 ${r.emphasis ? "font-medium text-[var(--color-ok)]" : "text-[var(--color-doc)]"}`}>
 {r.live}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </Section>

 <Section id="going-live" title="Going live">
 <p>
 Going live is configuration, not new code. None of these steps touch application logic;
 they connect <em>your</em> accounts and secrets. You can do them in any order and test
 incrementally.
 </p>
 <ol className="mt-6 space-y-3">
 {[
 ["Provision Aurora", "Create an Amazon Aurora PostgreSQL Serverless v2 cluster, enable the pgvector extension, point DATABASE_URL at it, and run the migration. TLS is verified against the vendored Amazon RDS CA bundle out of the box."],
 ["Deploy to Vercel", "Import the repo, set the environment variables, and deploy. The same project hosts the dashboard and is the deploy and rollback target."],
 ["Connect Sentry", "Add an internal integration / webhook pointing your issue alerts at the ingest route, and set the client secret so Warden can verify the signature."],
 ["Add agent keys", "Provide the provider keys for the Fixer and the reviewer panel, either as Vercel environment variables or through the dashboard. Both reach the agents."],
 ["Flip the switch", "Set WARDEN_MODE=live. Any capability whose secret is missing degrades gracefully back to simulation for that capability only."],
 ].map(([t, d], i) => (
 <li key={t} className="flex gap-4 rounded-lg border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_55%,transparent)] p-4">
 <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[color-mix(in_srgb,var(--color-brand)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-brand)_16%,transparent)] font-mono text-xs font-semibold text-[var(--color-brand-2)]">
 {i + 1}
 </span>
 <div>
 <p className="text-sm font-semibold text-[var(--color-text)]">{t}</p>
 <p className="mt-1 text-sm leading-relaxed text-[var(--color-doc)]">{d}</p>
 </div>
 </li>
 ))}
 </ol>
 <Callout tone="warn">
 The live adapters are written to fail closed. Until the live verification harness and
 production health watch are wired to your accounts, live incidents that hit them escalate
 to a human rather than do the wrong thing. Set <code className="wd-code">WARDEN_API_SECRET</code>{" "}
 before going live so production mutations are never world-writable.
 </Callout>
 </Section>

 <Section id="faq" title="FAQ">
 <dl className="space-y-5">
 {FAQ.map((f) => (
 <div key={f.q} className="border-t border-[var(--color-line)] pt-5 first:border-t-0 first:pt-0">
 <dt className="text-sm font-semibold text-[var(--color-text)]">{f.q}</dt>
 <dd className="mt-2 text-sm leading-relaxed text-[var(--color-doc)]">{f.a}</dd>
 </div>
 ))}
 </dl>
 </Section>

 <div className="mt-14 flex flex-col items-start gap-4 rounded-xl border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_55%,transparent)] p-6 sm:flex-row sm:items-center sm:justify-between">
 <div>
 <p className="text-base font-semibold text-[var(--color-text)]">See it close an incident.</p>
 <p className="mt-1 text-sm text-[var(--color-doc)]">
 Open the dashboard and watch the loop run end to end.
 </p>
 </div>
 <Link
 href="/dashboard"
 className="wd-cta inline-flex shrink-0 items-center gap-2 rounded-md bg-[var(--color-brand)] px-5 py-2.5 text-sm font-semibold text-white"
 >
 Open dashboard <span aria-hidden>→</span>
 </Link>
 </div>
 </div>
 </div>
 </div>
 </main>
 );
}

/* An anchored documentation section with a linkable heading. */
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
 return (
 <section id={id} className="mt-14 scroll-mt-24 border-t border-[var(--color-line)] pt-10">
 <h2 className="text-xl font-semibold tracking-tight text-[var(--color-text)] sm:text-2xl">
 {title}
 </h2>
 <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-[var(--color-doc)] sm:text-base">
 {children}
 </div>
 </section>
 );
}

/* A bordered aside for a key point. tone="warn" gives it the amber edge. */
function Callout({ children, tone = "brand" }: { children: React.ReactNode; tone?: "brand" | "warn" }) {
 const color = tone === "warn" ? "var(--color-warn)" : "var(--color-brand)";
 return (
 <div
 className="mt-5 rounded-lg border-l-2 p-4 text-sm leading-relaxed text-[var(--color-text)]"
 style={{
 borderColor: color,
 background: `color-mix(in srgb, ${color} 8%, transparent)`,
 }}
 >
 {children}
 </div>
 );
}

function CheckGlyph() {
 return (
 <svg
 className="mt-0.5 shrink-0"
 width="16"
 height="16"
 viewBox="0 0 24 24"
 fill="none"
 stroke="var(--color-ok)"
 strokeWidth="3"
 strokeLinecap="round"
 strokeLinejoin="round"
 aria-hidden
 >
 <path d="M20 6 9 17l-5-5" />
 </svg>
 );
}
