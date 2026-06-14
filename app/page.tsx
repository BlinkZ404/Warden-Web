import Link from "next/link";
import type { CSSProperties } from "react";

/* ── decorative scene data (deterministic — no Math.random, so SSR is stable) ── */

// Floating code-debris around the impact. Positions in %, sizes in px.
const SHARDS: {
  x: number; y: number; s: number; r: number;
  dx: string; dy: string; dr: string; dur: number; delay: number;
  lit?: "brand" | "spark"; clip: string;
}[] = [
  { x: 28, y: 30, s: 34, r: -22, dx: "-12px", dy: "-18px", dr: "10deg", dur: 9, delay: 0, clip: "polygon(18% 0,82% 10%,100% 56%,70% 100%,16% 86%,0 38%)" },
  { x: 71, y: 26, s: 26, r: 14, dx: "12px", dy: "-14px", dr: "-9deg", dur: 11, delay: 1.1, lit: "spark", clip: "polygon(50% 0,100% 35%,84% 100%,20% 92%,0 40%)" },
  { x: 20, y: 56, s: 22, r: 30, dx: "-10px", dy: "12px", dr: "8deg", dur: 12, delay: 0.6, clip: "polygon(0 18%,72% 0,100% 60%,60% 100%,8% 84%)" },
  { x: 80, y: 58, s: 30, r: -12, dx: "14px", dy: "14px", dr: "-7deg", dur: 10, delay: 1.8, lit: "brand", clip: "polygon(20% 4%,86% 0,100% 64%,62% 96%,0 70%)" },
  { x: 38, y: 68, s: 18, r: 8, dx: "-6px", dy: "16px", dr: "12deg", dur: 8, delay: 0.3, clip: "polygon(50% 0,100% 50%,50% 100%,0 50%)" },
  { x: 62, y: 72, s: 20, r: -18, dx: "8px", dy: "16px", dr: "-10deg", dur: 13, delay: 2.2, lit: "spark", clip: "polygon(16% 6%,84% 0,100% 70%,46% 100%,0 52%)" },
  { x: 14, y: 40, s: 16, r: 40, dx: "-8px", dy: "-8px", dr: "9deg", dur: 9.5, delay: 1.4, clip: "polygon(50% 0,100% 38%,82% 100%,12% 88%,0 34%)" },
  { x: 86, y: 40, s: 18, r: -28, dx: "10px", dy: "-6px", dr: "-8deg", dur: 11.5, delay: 0.9, clip: "polygon(22% 0,100% 28%,90% 92%,18% 100%,0 46%)" },
  { x: 48, y: 22, s: 22, r: 18, dx: "4px", dy: "-16px", dr: "10deg", dur: 10.5, delay: 1.6, lit: "brand", clip: "polygon(50% 0,96% 42%,74% 100%,18% 92%,2% 40%)" },
  { x: 33, y: 82, s: 14, r: -10, dx: "-6px", dy: "10px", dr: "-12deg", dur: 8.5, delay: 0.5, clip: "polygon(0 20%,76% 0,100% 64%,52% 100%,10% 80%)" },
  { x: 66, y: 84, s: 16, r: 24, dx: "6px", dy: "10px", dr: "8deg", dur: 12.5, delay: 2.6, clip: "polygon(20% 0,84% 12%,100% 60%,66% 100%,0 50%)" },
  { x: 52, y: 50, s: 12, r: 0, dx: "0px", dy: "-10px", dr: "16deg", dur: 7.5, delay: 1.2, lit: "spark", clip: "polygon(50% 0,100% 50%,50% 100%,0 50%)" },
];

// Twinkling glints (golden-angle scatter around the shield).
const SPARKS = Array.from({ length: 28 }, (_, i) => {
  const ang = i * 137.508 * (Math.PI / 180);
  const rad = 5 + (i % 9) * 4.6;
  return {
    x: 50 + Math.cos(ang) * rad * 1.18,
    y: 50 + Math.sin(ang) * rad,
    s: 2 + (i % 4),
    dur: 3 + (i % 5),
    delay: (i % 11) * 0.32,
    spark: i % 3 === 0,
  };
});

// Embers rising out of the impact.
const EMBERS = Array.from({ length: 12 }, (_, i) => ({
  x: 12 + i * 6.6,
  s: 2 + (i % 3),
  dur: 6 + (i % 5),
  delay: (i % 7) * 0.8,
}));

export default function Home() {
  return (
    <main className="relative flex h-screen min-h-[640px] flex-col overflow-hidden bg-[var(--color-ink)]">
      {/* ── atmosphere (all decorative) ─────────────────────────────────────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="wd-vignette absolute inset-0" />
        <div className="wd-grain absolute inset-0 opacity-[0.06] mix-blend-screen" />

        {/* the shield + its aura, dead center of the impact */}
        <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2">
          <div
            className="wd-aura absolute left-1/2 top-1/2 h-[460px] w-[460px] rounded-full"
            style={{
              background:
                "radial-gradient(closest-side, color-mix(in srgb, var(--color-brand) 55%, transparent), transparent 70%)",
            }}
          />
          <div
            className="wd-ring absolute left-1/2 top-1/2 h-[300px] w-[300px] rounded-full border"
            style={{ borderColor: "color-mix(in srgb, var(--color-brand) 45%, transparent)" }}
          />
          <div
            className="wd-ring absolute left-1/2 top-1/2 h-[300px] w-[300px] rounded-full border"
            style={{ borderColor: "color-mix(in srgb, var(--color-spark) 30%, transparent)", animationDelay: "2.2s" }}
          />
          <ShieldMark />
        </div>

        {/* floating debris */}
        {SHARDS.map((sh, i) => (
          <div
            key={i}
            className="wd-shard absolute"
            style={
              {
                left: `${sh.x}%`,
                top: `${sh.y}%`,
                width: sh.s,
                height: sh.s * 0.82,
                clipPath: sh.clip,
                background: sh.lit
                  ? `linear-gradient(140deg, color-mix(in srgb, var(--color-${sh.lit === "spark" ? "spark" : "brand-2"}) 70%, #11141b), #11141b)`
                  : "linear-gradient(140deg, #2b3140, #0e1118)",
                boxShadow: sh.lit
                  ? `0 0 16px color-mix(in srgb, var(--color-${sh.lit === "spark" ? "spark" : "brand"}) 70%, transparent)`
                  : "inset 0 0 6px rgba(0,0,0,0.6)",
                "--r": `${sh.r}deg`,
                "--dx": sh.dx,
                "--dy": sh.dy,
                "--dr": sh.dr,
                "--dur": `${sh.dur}s`,
                "--delay": `${sh.delay}s`,
              } as CSSProperties
            }
          />
        ))}

        {/* twinkling glints */}
        {SPARKS.map((sp, i) => (
          <div
            key={i}
            className="wd-spark absolute rounded-full"
            style={
              {
                left: `${sp.x}%`,
                top: `${sp.y}%`,
                width: sp.s,
                height: sp.s,
                background: sp.spark ? "var(--color-spark)" : "var(--color-brand-2)",
                boxShadow: `0 0 8px ${sp.spark ? "var(--color-spark)" : "var(--color-brand)"}`,
                "--dur": `${sp.dur}s`,
                "--delay": `${sp.delay}s`,
              } as CSSProperties
            }
          />
        ))}

        {/* rising embers */}
        {EMBERS.map((e, i) => (
          <div
            key={i}
            className="wd-ember absolute bottom-[26%] rounded-full"
            style={
              {
                left: `${e.x}%`,
                width: e.s,
                height: e.s,
                background: "var(--color-brand-2)",
                boxShadow: "0 0 7px var(--color-brand)",
                "--dur": `${e.dur}s`,
                "--delay": `${e.delay}s`,
              } as CSSProperties
            }
          />
        ))}

        {/* slow light sweep + framing */}
        <div className="wd-sweep absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--color-brand)_18%,transparent)] to-transparent" />
        <div
          className="absolute inset-3 rounded-[20px] sm:inset-5"
          style={{ border: "1px solid color-mix(in srgb, var(--color-brand) 22%, transparent)" }}
        />
      </div>

      {/* ── top chrome ──────────────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-9">
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

      {/* ── centered hero copy ─────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[760px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: "radial-gradient(closest-side, color-mix(in srgb, var(--color-ink) 78%, transparent), transparent 75%)" }}
        />
        <p className="relative inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_55%,transparent)] px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-[var(--color-brand-2)] backdrop-blur-sm">
          Autonomous on-call engineer
        </p>
        <h1 className="relative mt-6 text-[clamp(2.4rem,6vw,4.5rem)] font-semibold leading-[1.04] tracking-tight">
          The on-call engineer
          <br />
          <span className="bg-gradient-to-r from-[var(--color-brand-2)] via-[var(--color-spark)] to-[var(--color-brand-2)] bg-clip-text text-transparent">
            you don&apos;t have.
          </span>
        </h1>
        <p className="relative mt-5 max-w-xl text-base text-[var(--color-muted)] sm:text-lg">
          Warden catches a production crash, fixes it, proves the fix on a live
          preview, and waits for your one tap. You sleep. It ships.
        </p>
        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
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

      {/* ── bottom chrome: caption pill + provenance ───────────────────────── */}
      <div className="relative z-10 flex items-end justify-between gap-4 px-6 pb-6 sm:px-9 sm:pb-8">
        <Link
          href="/dashboard"
          className="group flex max-w-md items-center gap-3 rounded-2xl border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_60%,transparent)] p-2 pl-4 backdrop-blur-md transition hover:border-[color-mix(in_srgb,var(--color-brand)_60%,var(--color-line))]"
        >
          <span className="text-xs leading-snug text-[var(--color-muted)]">
            Catches, fixes &amp; verifies production errors — deterministically — then
            waits for your one tap. Built to ship safely while you&apos;re asleep.
          </span>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-brand)] text-white transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 12L12 4M12 4H6M12 4V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </Link>
        <p className="hidden max-w-[14rem] text-right text-[11px] leading-snug text-[var(--color-muted)] sm:block">
          Built on Amazon Aurora PostgreSQL (Serverless&nbsp;v2) — deliberate state
          machine, append-only audit log, pgvector memory.
        </p>
      </div>
    </main>
  );
}

/* The central shield — glowing, with a verified check. The product, as a mark. */
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
