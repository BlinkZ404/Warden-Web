import type { ReactNode, ButtonHTMLAttributes } from "react";
import { CopyButton } from "@/app/_components/copy-button";

const GRID_MARK = "color-mix(in srgb, var(--color-text) 18%, transparent)";

// ── interaction + layout primitives ──────────────────────────────────────────

/** The one accent CTA and its variants. Owns hover / active / disabled state so
 * no page hand-rolls a button again (focus ring comes from the global rule). */
export function Button({
 variant = "primary",
 size = "md",
 className = "",
 href,
 children,
 ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
 variant?: "primary" | "secondary" | "danger" | "ghost";
 size?: "sm" | "md" | "lg";
 /** When set, render an anchor with the same styling instead of a button. */
 href?: string;
}) {
 const sizes = {
 sm: "px-3 py-1.5 text-xs",
 md: "px-4 py-2 text-sm",
 lg: "px-5 py-2.5 text-sm",
 };
 const variants = {
 primary:
 "bg-[var(--color-accent)] font-medium text-white shadow-sm hover:bg-[color-mix(in_srgb,var(--color-accent)_82%,#fff)] hover:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_25%,transparent)]",
 secondary:
 "border border-[var(--color-line)] font-medium text-[var(--color-text)] hover:border-[var(--color-accent)] hover:bg-[var(--color-panel-2)]",
 danger:
 "border border-[color-mix(in_srgb,var(--color-bad)_40%,var(--color-line))] font-medium text-[var(--color-bad)] hover:border-[var(--color-bad)] hover:bg-[color-mix(in_srgb,var(--color-bad)_12%,transparent)]",
 ghost: "font-medium text-[var(--color-muted)] hover:text-[var(--color-text)]",
 };
 const cls = `inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${sizes[size]} ${variants[variant]} ${className}`;
 if (href) {
 return (
 <a href={href} className={cls}>
 {children}
 </a>
 );
 }
 return (
 <button className={cls} {...props}>
 {children}
 </button>
 );
}

/** Showing X-Y of N + Prev/Next, owning the page-bounds math so list pages don't
 * each re-derive it. Renders nothing when there's no data. */
export function Pager({
 page,
 pageSize,
 total,
 onPage,
 className = "",
}: {
 page: number;
 pageSize: number;
 total: number;
 onPage: (p: number) => void;
 className?: string;
}) {
 if (total === 0) return null;
 const start = page * pageSize + 1;
 const end = Math.min((page + 1) * pageSize, total);
 return (
 <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
 <span className="font-mono text-[11px] text-[var(--color-muted)]">
 Showing {start}-{end} of {total}
 </span>
 <div className="flex items-center gap-2">
 <Button
 variant="secondary"
 size="sm"
 onClick={() => onPage(Math.max(0, page - 1))}
 disabled={page === 0}
 >
 Prev
 </Button>
 <Button
 variant="secondary"
 size="sm"
 onClick={() => onPage(page + 1)}
 disabled={end >= total}
 >
 Next
 </Button>
 </div>
 </div>
 );
}

/** The page top bar: a semantic <h1> (kept in the console's lowercase-mono style)
 * plus a right-aligned, always-wrapping actions/aside slot. */
export function PageHeader({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
 return (
 <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] px-7">
 <h1 className="font-mono text-xs text-[var(--color-text)]">{title}</h1>
 {aside != null && <div className="flex flex-wrap items-center gap-3">{aside}</div>}
 </header>
 );
}

/** A tinted inline notice (error/success/warning), used for save + OAuth banners. */
export function Banner({ tone = "var(--color-bad)", children }: { tone?: string; children: ReactNode }) {
 return (
 <p
 className="px-4 py-2.5 font-mono text-xs"
 style={{
 color: tone,
 border: `1px solid color-mix(in srgb, ${tone} 40%, var(--color-line))`,
 background: `color-mix(in srgb, ${tone} 8%, transparent)`,
 }}
 >
 {children}
 </p>
 );
}

export function PageBody({ children, className = "" }: { children: ReactNode; className?: string }) {
 return <div className={`px-7 py-6 ${className}`}>{children}</div>;
}

/** An external link with the right rel/target and an affordance arrow. */
export function ExternalLink({
 href,
 children,
 className = "",
}: {
 href: string;
 children?: ReactNode;
 className?: string;
}) {
 return (
 <a
 href={href}
 target="_blank"
 rel="noreferrer noopener"
 className={`break-all text-[var(--color-brand-2)] underline-offset-2 transition hover:underline ${className}`}
 >
 {children ?? href}
 </a>
 );
}

/** A status dot. Status is never color-only at call sites; pair with text/title. */
export function Dot({
 tone,
 title,
 className = "",
}: {
 tone: string;
 title?: string;
 className?: string;
}) {
 return (
 <span
 title={title}
 className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${className}`}
 style={{ background: tone }}
 />
 );
}

/** A monospace bordered chip, optionally active or tinted. */
export function Chip({
 active = false,
 tone,
 uppercase = false,
 onClick,
 title,
 children,
}: {
 active?: boolean;
 tone?: string;
 /** Render as an uppercase stamp. Off by default since some chips carry data
 * (file paths, amounts) that must not be case-folded; on for tag chips. */
 uppercase?: boolean;
 onClick?: () => void;
 title?: string;
 children: ReactNode;
}) {
 const style = tone
 ? { color: tone, borderColor: `color-mix(in srgb, ${tone} 35%, var(--color-line))` }
 : undefined;
 const base = `inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11px] transition${
 uppercase ? " uppercase tracking-wider" : ""
 }`;
 const cls = tone
 ? base
 : active
 ? `${base} border-[color-mix(in_srgb,var(--color-accent)_50%,var(--color-line))] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-brand-2)]`
 : `${base} border-[var(--color-line)] text-[var(--color-muted)] ${onClick ? "hover:text-[var(--color-text)]" : ""}`;
 if (onClick) {
 return (
 <button onClick={onClick} title={title} className={cls} style={style}>
 {children}
 </button>
 );
 }
 return (
 <span title={title} className={cls} style={style}>
 {children}
 </span>
 );
}

/** Connection status: a dot AND text, so it reads without relying on color. */
export function ConnectionStatus({ connected }: { connected: boolean }) {
 const tone = connected ? "var(--color-ok)" : "var(--color-muted)";
 return (
 <span
 className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider"
 style={{ color: tone }}
 >
 <Dot tone={connected ? "var(--color-ok)" : "var(--color-line)"} />
 {connected ? "connected" : "not set"}
 </span>
 );
}

/** The three data-view states, so every list/panel renders the same way. */
export function Loading({ label = "loading…" }: { label?: string }) {
 return (
 <div className="px-5 py-12 text-center font-mono text-xs text-[var(--color-muted)]">{label}</div>
 );
}

export function Empty({ children }: { children: ReactNode }) {
 return (
 <div className="px-5 py-12 text-center font-mono text-xs text-[var(--color-muted)]">
 {children}
 </div>
 );
}

export function ErrorState({
 onRetry,
 children = "Couldn't load this. The next refresh will retry.",
}: {
 onRetry?: () => void;
 children?: ReactNode;
}) {
 return (
 <div className="flex flex-col items-center gap-3 px-5 py-12 text-center font-mono text-xs text-[var(--color-bad)]">
 <span>{children}</span>
 {onRetry && (
 <Button variant="secondary" size="sm" onClick={onRetry}>
 Retry
 </Button>
 )}
 </div>
 );
}

/** A `+` mark centered on a corner, sitting where grid lines intersect. */
export function Plus({ at }: { at: "tl" | "tr" | "bl" | "br" }) {
 const pos = {
 tl: "left-0 top-0 -translate-x-1/2 -translate-y-1/2",
 tr: "right-0 top-0 translate-x-1/2 -translate-y-1/2",
 bl: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2",
 br: "right-0 bottom-0 translate-x-1/2 translate-y-1/2",
 }[at];
 return (
 <span className={`pointer-events-none absolute z-10 h-2.5 w-2.5 ${pos}`} aria-hidden>
 <span className="absolute inset-0 m-auto h-2.5 w-px" style={{ background: GRID_MARK }} />
 <span className="absolute inset-0 m-auto h-px w-2.5" style={{ background: GRID_MARK }} />
 </span>
 );
}

/** Square bordered region with corner marks. */
export function Frame({
 className = "",
 innerClassName = "",
 plus = true,
 children,
}: {
 className?: string;
 innerClassName?: string;
 plus?: boolean;
 children: ReactNode;
}) {
 return (
 <div className={`relative ${className}`}>
 <div className={`border border-[var(--color-line)] bg-[var(--color-panel)] ${innerClassName}`}>
 {children}
 </div>
 {plus && (
 <>
 <Plus at="tl" />
 <Plus at="tr" />
 <Plus at="bl" />
 <Plus at="br" />
 </>
 )}
 </div>
 );
}

/**
 * Continuous single-line grid: the gap shows through to the line-colored
 * background, so cells share one 1px border instead of stacking two.
 */
export function Grid({
 cols = "grid-cols-1 lg:grid-cols-2",
 className = "",
 children,
}: {
 cols?: string;
 className?: string;
 children: ReactNode;
}) {
 return (
 <div className={`relative ${className}`}>
 <div
 className={`grid ${cols} gap-px border border-[var(--color-line)] bg-[var(--color-line)]`}
 >
 {children}
 </div>
 <Plus at="tl" />
 <Plus at="tr" />
 <Plus at="bl" />
 <Plus at="br" />
 </div>
 );
}

/** One cell of a Grid: icon + title header, then content. */
export function Cell({
 icon,
 title,
 aside,
 span2 = false,
 className = "",
 children,
}: {
 icon?: ReactNode;
 title?: ReactNode;
 aside?: ReactNode;
 span2?: boolean;
 className?: string;
 children: ReactNode;
}) {
 return (
 <section
 className={`bg-[var(--color-panel)] p-5 ${span2 ? "lg:col-span-2" : ""} ${className}`}
 >
 {(title || aside) && (
 <header className="mb-3 flex items-center justify-between gap-3">
 <div className="flex items-center gap-2.5">
 {icon && <span className="text-[var(--color-brand-2)]">{icon}</span>}
 {title && (
 <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
 {title}
 </h3>
 )}
 </div>
 {aside ? <Label>{aside}</Label> : null}
 </header>
 )}
 {children}
 </section>
 );
}

export interface StatTile {
 label: string;
 value: string;
 hint?: string;
 tone?: string;
}

/** A bordered 4-up grid of stat tiles with corner marks. `lg` is the page-level
 * scale; `sm` is the denser inline strip used on the incidents dashboard. */
export function StatTiles({ tiles, size = "lg" }: { tiles: StatTile[]; size?: "lg" | "sm" }) {
 const pad = size === "lg" ? "p-5" : "p-4";
 const valueCls =
 size === "lg"
 ? "mt-2 font-mono text-3xl font-semibold"
 : "mt-1.5 font-mono text-2xl font-semibold";
 const hintCls = size === "lg" ? "mt-1.5" : "mt-1";
 return (
 <div className="relative">
 <div className="grid grid-cols-2 gap-px border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-4">
 {tiles.map((t) => (
 <div key={t.label} className={`bg-[var(--color-panel)] ${pad}`}>
 <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
 {t.label}
 </div>
 <div className={valueCls} style={t.tone ? { color: t.tone } : undefined}>
 {t.value}
 </div>
 {t.hint != null && (
 <div className={`${hintCls} text-[11px] text-[var(--color-muted)]`}>{t.hint}</div>
 )}
 </div>
 ))}
 </div>
 <Plus at="tl" />
 <Plus at="tr" />
 <Plus at="bl" />
 <Plus at="br" />
 </div>
 );
}

/** Uppercase monospace micro-label. */
export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
 return (
 <span
 className={`font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)] ${className}`}
 >
 {children}
 </span>
 );
}

/** Monospace key → value row. A string value that is an http(s) URL renders as a
 * clickable link that opens in a new tab. */
export function Field({
 label,
 value,
 accent = false,
 copy,
}: {
 label: string;
 value: ReactNode;
 accent?: boolean;
 /** When set, render a copy-to-clipboard affordance for this raw value. */
 copy?: string;
}) {
 const isUrl = typeof value === "string" && /^https?:\/\/\S+$/.test(value);
 return (
 <div className="flex gap-3.5 py-[3px] text-xs leading-relaxed">
 <span className="w-24 shrink-0 whitespace-nowrap font-mono uppercase tracking-wider text-[var(--color-muted)]">
 {label}
 </span>
 <span className="flex min-w-0 flex-1 items-start gap-2">
 {isUrl ? (
 <ExternalLink href={value as string} className="font-mono">
 {value}
 </ExternalLink>
 ) : (
 <span
 className={`min-w-0 break-words font-mono ${accent ? "text-[var(--color-brand-2)]" : "text-[var(--color-text)]"}`}
 >
 {value}
 </span>
 )}
 {copy && <CopyButton value={copy} />}
 </span>
 </div>
 );
}
