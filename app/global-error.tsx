"use client";

import "./globals.css";

/* Catches errors thrown in the root layout itself (where the normal error
 boundary can't reach), so it must render its own <html>/<body>. */
export default function GlobalError({
 error,
 reset,
}: {
 error: Error & { digest?: string };
 reset: () => void;
}) {
 return (
 <html lang="en">
 <body>
 <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[var(--color-ink)] px-6 text-center text-[var(--color-text)]">
 <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-bad)]">
 Error 500
 </span>
 <h1 className="text-4xl font-bold tracking-tight">Something broke.</h1>
 <p className="max-w-md text-[15px] leading-relaxed text-[var(--color-doc)]">
 An unexpected error interrupted the app. Try again, or reload the page.
 </p>
 {error?.digest && (
 <p className="font-mono text-xs text-[var(--color-muted)]">Reference: {error.digest}</p>
 )}
 <button
 onClick={reset}
 className="mt-2 rounded-md bg-[var(--color-brand)] px-6 py-3 text-sm font-semibold text-white"
 >
 Try again
 </button>
 </main>
 </body>
 </html>
 );
}
