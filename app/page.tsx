import Link from "next/link";
import type { CSSProperties } from "react";

// The incident lifecycle, mirrored from the real state machine. Each stage
// lights up in sequence in its own color — a wave that loops forever, so the
// hero literally shows Warden catching → fixing → verifying → shipping a fix.
const STAGES: { label: string; c: string }[] = [
  { label: "Detected", c: "var(--color-bad)" },
  { label: "Investigated", c: "var(--color-warn)" },
  { label: "Fixed", c: "var(--color-accent)" },
  { label: "Reviewed", c: "var(--color-escalate)" },
  { label: "Verified", c: "var(--color-accent)" },
  { label: "Shipped", c: "var(--color-ok)" },
];

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16">
      {/* ambient background motion (behind everything) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="warden-grid absolute inset-0 opacity-[0.5]" />
        <div className="warden-radar absolute left-1/2 top-[36%] h-[820px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60" />
        <div className="warden-aurora absolute left-1/2 top-[20%] h-[460px] w-[760px]" />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[var(--color-ink)] to-transparent" />
      </div>

      <div className="w-full max-w-3xl">
        {/* eyebrow with a live "on" dot */}
        <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-[var(--color-accent)]">
          <span className="warden-live inline-block h-2 w-2 rounded-full bg-[var(--color-ok)]" />
          Warden
          <span className="text-[var(--color-muted)] normal-case tracking-normal">
            · on call, right now
          </span>
        </p>

        <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
          The on-call engineer{" "}
          <span className="bg-gradient-to-r from-[var(--color-text)] via-[var(--color-accent)] to-[var(--color-escalate)] bg-clip-text text-transparent">
            you don&apos;t have.
          </span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-[var(--color-muted)]">
          It catches production errors, fixes them, checks itself, and waits for
          your one-tap approval before anything ships.
        </p>

        {/* the live incident pipeline — the star of the page */}
        <div className="relative mt-9 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]/70 p-5 backdrop-blur-sm">
          <div
            aria-hidden
            className="warden-scan absolute inset-x-0 h-px bg-[var(--color-accent)] shadow-[0_0_12px_2px_var(--color-accent)]"
          />
          {/* the alert that "fires" */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
            <span className="warden-flash text-[var(--color-bad)]">●</span>
            <span className="text-[var(--color-text)]">checkout-service</span>
            <span className="text-[var(--color-muted)]">
              TypeError: cannot read &apos;amount&apos; of undefined
            </span>
          </div>

          {/* the pipeline */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {STAGES.map((s, i) => (
              <div
                key={s.label}
                className="warden-node flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                style={{ "--i": i, "--node-c": s.c } as CSSProperties}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: s.c }}
                />
                {s.label}
              </div>
            ))}
          </div>

          {/* the progress rail: red (crash) → blue (fixing) → green (shipped) */}
          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-[var(--color-panel-2)]">
            <div className="warden-rail h-full rounded-full" />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
            <span className="text-[var(--color-ok)]">✓ verified on a preview</span>
            <span>·</span>
            <span>0 regressions</span>
            <span>·</span>
            <span>waiting for your one tap</span>
          </div>
        </div>

        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="warden-cta rounded-lg bg-[var(--color-accent)] px-5 py-2.5 font-medium text-black"
          >
            Open dashboard →
          </Link>
          <a
            href="https://github.com"
            className="warden-cta rounded-lg border border-[var(--color-line)] px-5 py-2.5 font-medium text-[var(--color-text)] hover:bg-[var(--color-panel)]"
          >
            How it works
          </a>
        </div>

        <p className="mt-9 max-w-xl text-xs text-[var(--color-muted)]">
          Built on Amazon Aurora PostgreSQL (Serverless v2) — the deliberate state
          machine, append-only audit log, and pgvector incident memory that let it
          get safer over time.
        </p>
      </div>
    </main>
  );
}
