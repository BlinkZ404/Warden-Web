import Link from "next/link";
import type { Metadata } from "next";
import { Wordmark } from "./_components/wordmark";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
 return (
 <main className="relative flex min-h-screen flex-col overflow-hidden bg-[var(--color-ink)] text-[var(--color-text)]">
 <div aria-hidden className="pointer-events-none absolute inset-0">
 <div className="wd-vignette absolute inset-0" />
 <div className="wd-dots absolute inset-0 opacity-50" />
 <div className="absolute inset-x-0 bottom-[5%] flex justify-center">
 <span className="wd-outline select-none text-[30vw] font-black leading-none tracking-tighter">
 404
 </span>
 </div>
 </div>

 <header className="relative z-10 border-b border-[var(--color-line)]">
 <div className="mx-auto max-w-7xl px-6 py-4 sm:px-8">
 <Link href="/" className="flex w-fit items-center">
 <Wordmark />
 </Link>
 </div>
 </header>

 <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
 <span className="inline-flex items-center rounded-md border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_60%,transparent)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--color-brand-2)] backdrop-blur-sm">
 Error 404
 </span>
 <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
 This page isn&apos;t{" "}
 <span className="bg-gradient-to-r from-[var(--color-brand-2)] via-[var(--color-spark)] to-[var(--color-brand-2)] bg-clip-text text-transparent">
 on call
 </span>
 .
 </h1>
 <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--color-doc)]">
 The page you&apos;re looking for doesn&apos;t exist or has moved. Let&apos;s get you back
 to safe ground.
 </p>
 <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
 <Link
 href="/"
 className="wd-cta inline-flex items-center gap-2 rounded-md bg-[var(--color-brand)] px-6 py-3 text-sm font-semibold text-white"
 >
 Back to home <span aria-hidden>→</span>
 </Link>
 <Link
 href="/dashboard"
 className="wd-ghost inline-flex items-center gap-2 rounded-md border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_50%,transparent)] px-6 py-3 text-sm font-medium text-[var(--color-text)] backdrop-blur-sm"
 >
 Open dashboard
 </Link>
 </div>
 </div>
 </main>
 );
}
