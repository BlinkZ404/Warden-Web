import Link from "next/link";
import type { CSSProperties } from "react";
import BrandRobot from "./_components/brand-robot";

/* ── decorative scene data (deterministic; no Math.random, so SSR is stable) ── */

// Floating code-debris around the impact. Positions in %, sizes in px.
const SHARDS: {
 x: number; y: number; s: number; r: number;
 dx: string; dy: string; dr: string; dur: number; delay: number;
 lit?: "brand" | "spark"; icon: string;
}[] = [
 { x: 28, y: 30, s: 44, r: -22, dx: "-12px", dy: "-18px", dr: "10deg", dur: 9, delay: 0, icon: "lock", lit: "brand" },
 { x: 71, y: 26, s: 36, r: 14, dx: "12px", dy: "-14px", dr: "-9deg", dur: 11, delay: 1.1, icon: "key", lit: "spark" },
 { x: 20, y: 56, s: 32, r: 30, dx: "-10px", dy: "12px", dr: "8deg", dur: 12, delay: 0.6, icon: "shield" },
 { x: 80, y: 58, s: 40, r: -12, dx: "14px", dy: "14px", dr: "-7deg", dur: 10, delay: 1.8, icon: "terminal", lit: "brand" },
 { x: 38, y: 68, s: 28, r: 8, dx: "-6px", dy: "16px", dr: "12deg", dur: 8, delay: 0.3, icon: "eye" },
 { x: 62, y: 72, s: 30, r: -18, dx: "8px", dy: "16px", dr: "-10deg", dur: 13, delay: 2.2, icon: "code", lit: "spark" },
 { x: 14, y: 40, s: 26, r: 40, dx: "-8px", dy: "-8px", dr: "9deg", dur: 9.5, delay: 1.4, icon: "server" },
 { x: 86, y: 40, s: 28, r: -28, dx: "10px", dy: "-6px", dr: "-8deg", dur: 11.5, delay: 0.9, icon: "alert" },
 { x: 48, y: 22, s: 32, r: 18, dx: "4px", dy: "-16px", dr: "10deg", dur: 10.5, delay: 1.6, icon: "check", lit: "brand" },
 { x: 33, y: 82, s: 24, r: -10, dx: "-6px", dy: "10px", dr: "-12deg", dur: 8.5, delay: 0.5, icon: "lock" },
 { x: 66, y: 84, s: 26, r: 24, dx: "6px", dy: "10px", dr: "8deg", dur: 12.5, delay: 2.6, icon: "key" },
 { x: 52, y: 50, s: 22, r: 0, dx: "0px", dy: "-10px", dr: "16deg", dur: 7.5, delay: 1.2, icon: "shield", lit: "spark" },
];

export default function Home() {
 return (
 <main className="relative flex h-screen min-h-[640px] flex-col overflow-hidden bg-[var(--color-ink)]">
 {/* ── atmosphere (all decorative) ─────────────────────────────────────── */}
 <div aria-hidden className="pointer-events-none absolute inset-0">
 <div className="wd-vignette absolute inset-0" />
 <div className="wd-grain absolute inset-0 opacity-[0.06] mix-blend-screen" />

 {/* floating debris */}
 {SHARDS.map((sh, i) => (
 <div
 key={i}
 className="wd-shard absolute flex items-center justify-center rounded-xl border"
 style={
 {
 left: `${sh.x}%`,
 top: `${sh.y}%`,
 width: sh.s,
 height: sh.s,
 borderColor: sh.lit
 ? `color-mix(in srgb, var(--color-${sh.lit === "spark" ? "spark" : "brand-2"}) 40%, transparent)`
 : "var(--color-line)",
 background: sh.lit
 ? `radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--color-${sh.lit === "spark" ? "spark" : "brand-2"}) 20%, transparent), rgba(18, 21, 28, 0.7))`
 : "rgba(18, 21, 28, 0.4)",
 backdropFilter: "blur(4px)",
 boxShadow: sh.lit
 ? `0 0 20px color-mix(in srgb, var(--color-${sh.lit === "spark" ? "spark" : "brand"}) 30%, transparent)`
 : "none",
 "--r": `${sh.r}deg`,
 "--dx": sh.dx,
 "--dy": sh.dy,
 "--dr": sh.dr,
 "--dur": `${sh.dur}s`,
 "--delay": `${sh.delay}s`,
 } as CSSProperties
 }
 >
 <SecurityIcon
 type={sh.icon}
 className="w-1/2 h-1/2"
 style={{
 color: sh.lit
 ? `var(--color-${sh.lit === "spark" ? "spark" : "brand-2"})`
 : "var(--color-muted)",
 }}
 />
 </div>
 ))}

 {/* slow light sweep + framing */}
 <div className="wd-sweep absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--color-brand)_18%,transparent)] to-transparent" />
 <div
 className="absolute inset-3 rounded-[20px] sm:inset-5"
 style={{ border: "1px solid color-mix(in srgb, var(--color-brand) 22%, transparent)" }}
 />
 </div>

 {/* ── top chrome ──────────────────────────────────────────────────────── */}
 <header className="relative z-10 w-full max-w-7xl mx-auto flex items-center justify-between px-6 py-5 sm:px-9">
 <div className="flex items-center gap-2.5">
 <ShieldGlyph />
 <span className="text-sm font-semibold tracking-[0.2em] text-[var(--color-text)]">
 WARDEN
 </span>
 <span className="hidden items-center gap-1.5 pl-2 text-xs text-[var(--color-muted)] sm:flex">
 <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-ok)] shadow-[0_0_8px_var(--color-ok)]" />
 on call
 </span>
 </div>
 <div className="flex items-center gap-2.5">
 <a
 href="https://github.com"
 className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_70%,transparent)] text-[var(--color-muted)] backdrop-blur-sm transition hover:border-[var(--color-brand)] hover:text-[var(--color-text)]"
 aria-label="GitHub"
 >
 <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
 <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
 </svg>
 </a>
 <Link
 href="/dashboard"
 className="wd-cta rounded-full bg-[var(--color-brand)] px-5 py-2 text-sm font-semibold text-white"
 >
 Open dashboard
 </Link>
 </div>
 </header>

 {/* ── hero section: left copy, right shield ────────────────────────── */}
 <div className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 items-center justify-center gap-12 px-6 sm:px-9 lg:grid-cols-12 lg:gap-16">
 {/* Left Side: Hero Copy */}
 <div className="relative flex flex-col items-center text-center lg:col-span-7 lg:items-start lg:text-left">
 {/* subtle background glow behind the text to help readability against particles */}
 <div
 aria-hidden
 className="pointer-events-none absolute -left-10 top-1/2 -z-10 h-[400px] w-[600px] max-w-[92vw] -translate-y-1/2 rounded-full opacity-60"
 style={{ background: "radial-gradient(closest-side, color-mix(in srgb, var(--color-ink) 92%, transparent), transparent)" }}
 />
 <p className="relative inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_55%,transparent)] px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-[var(--color-brand-2)] backdrop-blur-sm">
 Autonomous on-call engineer
 </p>
 <h1 className="relative mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.08] tracking-tight">
 <span className="block">The on-call engineer</span>
 <span className="bg-gradient-to-r from-[var(--color-brand-2)] via-[var(--color-spark)] to-[var(--color-brand-2)] bg-clip-text text-transparent block">
 you don&apos;t have.
 </span>
 </h1>
 <p className="relative mt-5 max-w-xl text-base text-[var(--color-muted)] sm:text-lg">
 Warden catches a production crash, fixes it, proves the fix on a live
 preview, and waits for your one tap. You sleep. It ships.
 </p>
 <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
 <Link
 href="/dashboard"
 className="wd-cta rounded-full bg-[var(--color-brand)] px-6 py-3 font-semibold text-white"
 >
 Open dashboard →
 </Link>
 <Link
 href="/dashboard"
 className="wd-ghost rounded-full border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_50%,transparent)] px-6 py-3 font-medium text-[var(--color-text)] backdrop-blur-sm"
 >
 Watch it ship a fix
 </Link>
 </div>
 </div>

 {/* Right Side: Interactive 3D Robot */}
 <div className="relative flex min-h-[400px] sm:min-h-[500px] w-full items-center justify-center lg:col-span-5">
 <div className="relative flex w-full h-[400px] sm:h-[500px] items-center justify-center">
 <div
 className="wd-aura absolute left-1/2 top-1/2 h-[360px] w-[360px] rounded-full sm:h-[460px] sm:w-[460px]"
 style={{
 background:
 "radial-gradient(closest-side, color-mix(in srgb, var(--color-brand) 55%, transparent), transparent 70%)",
 }}
 />
 <BrandRobot className="relative z-10 h-full w-full" />
 </div>
 </div>
 </div>

 {/* ── bottom chrome: caption pill + provenance ───────────────────────── */}
 <div className="relative z-10 w-full max-w-7xl mx-auto flex items-end justify-between gap-4 px-6 pb-6 sm:px-9 sm:pb-8">
 <Link
 href="/dashboard"
 className="group flex max-w-md items-center gap-3 rounded-2xl border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_60%,transparent)] p-2 pl-4 backdrop-blur-md transition hover:border-[color-mix(in_srgb,var(--color-brand)_60%,var(--color-line))]"
 >
 <span className="text-xs leading-snug text-[var(--color-muted)]">
 Catches production errors, fixes them, verifies on a preview, then
 waits for your tap. Built to ship safely while you&apos;re asleep.
 </span>
 <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-brand)] text-white transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
 <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
 <path d="M4 12L12 4M12 4H6M12 4V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
 </svg>
 </span>
 </Link>
 <p className="hidden max-w-[14rem] text-right text-[11px] leading-snug text-[var(--color-muted)] sm:block">
 Runs on Aurora PostgreSQL (Serverless&nbsp;v2) with a state machine, audit log, and
 pgvector memory.
 </p>
 </div>
 </main>
 );
}

/* The central shield: glowing, with a verified check. The product, as a mark. */
function ShieldMark() {
 return (
 <svg
 className="wd-shield relative"
 width="150"
 height="176"
 viewBox="0 0 120 140"
 fill="none"
 aria-hidden
 >
 <path
 d="M60 8 L108 26 V70 C108 104 86 124 60 132 C34 124 12 104 12 70 V26 Z"
 fill="var(--color-brand)"
 fillOpacity="0.22"
 stroke="var(--color-brand-2)"
 strokeWidth="2.5"
 />
 <path
 d="M42 70 L55 84 L80 52"
 stroke="var(--color-spark)"
 strokeWidth="6"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 </svg>
 );
}

/* Small shield glyph for the wordmark. */
function ShieldGlyph() {
 return (
 <svg width="18" height="21" viewBox="0 0 120 140" fill="none" aria-hidden>
 <path
 d="M60 8 L108 26 V70 C108 104 86 124 60 132 C34 124 12 104 12 70 V26 Z"
 fill="color-mix(in srgb, var(--color-brand) 30%, transparent)"
 stroke="var(--color-brand-2)"
 strokeWidth="6"
 />
 <path d="M42 70 L55 84 L80 52" stroke="var(--color-spark)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
 </svg>
 );
}

/* Security Icon component supporting Feather/Lucide styled SVGs */
function SecurityIcon({ type, className, style }: { type: string; className?: string; style?: React.CSSProperties }) {
 switch (type) {
 case "lock":
 return (
 <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
 <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
 <path d="M7 11V7a5 5 0 0 1 10 0v4" />
 </svg>
 );
 case "key":
 return (
 <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
 <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
 </svg>
 );
 case "shield":
 return (
 <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
 <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
 </svg>
 );
 case "terminal":
 return (
 <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
 <polyline points="4 17 10 11 4 5" />
 <line x1="12" y1="19" x2="20" y2="19" />
 </svg>
 );
 case "eye":
 return (
 <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
 <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
 <circle cx="12" cy="12" r="3" />
 </svg>
 );
 case "code":
 return (
 <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
 <polyline points="16 18 22 12 16 6" />
 <polyline points="8 6 2 12 8 18" />
 </svg>
 );
 case "server":
 return (
 <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
 <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
 <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
 <line x1="6" y1="6" x2="6.01" y2="6" />
 <line x1="6" y1="18" x2="6.01" y2="18" />
 </svg>
 );
 case "alert":
 return (
 <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
 <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
 <line x1="12" y1="9" x2="12" y2="13" />
 <line x1="12" y1="17" x2="12.01" y2="17" />
 </svg>
 );
 case "check":
 return (
 <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
 <polyline points="20 6 9 17 4 12" />
 </svg>
 );
 default:
 return null;
 }
}
