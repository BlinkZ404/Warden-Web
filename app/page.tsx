import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div>
        <p className="text-sm font-medium tracking-widest text-[var(--color-accent)] uppercase">
          Nightshift
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight">
          The on-call engineer you don&apos;t have.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-[var(--color-muted)]">
          It catches production errors, fixes them, checks itself, and waits for
          your one-tap approval before anything ships.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard"
          className="rounded-lg bg-[var(--color-accent)] px-5 py-2.5 font-medium text-black transition hover:opacity-90"
        >
          Open dashboard →
        </Link>
        <a
          href="https://github.com"
          className="rounded-lg border border-[var(--color-line)] px-5 py-2.5 font-medium text-[var(--color-text)] transition hover:bg-[var(--color-panel)]"
        >
          How it works
        </a>
      </div>

      <p className="text-xs text-[var(--color-muted)]">
        Built on Amazon Aurora PostgreSQL (Serverless v2) — the deliberate state
        machine, append-only audit log, and pgvector incident memory that let it
        get safer over time.
      </p>
    </main>
  );
}
