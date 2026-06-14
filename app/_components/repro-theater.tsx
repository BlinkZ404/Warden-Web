import type { ReproPair } from "@/lib/incident-derive";

/**
 * The red→green: the production error that fired, beside the same reproduction
 * running clean after the fix. Shows the verification checks a founder needs
 * without reading a diff.
 */
export function ReproTheater({ pair }: { pair: ReproPair }) {
 if (!pair.before && !pair.after) return null;
 return (
 <div className="relative mt-3 grid gap-px border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-2">
 <div className="bg-[var(--color-panel)] p-3.5">
 <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-bad)]">
 <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-bad)]" />
 before · in production
 </div>
 <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[var(--color-bad)]">
 {pair.before ?? "the failing request"}
 </pre>
 {pair.after?.call && (
 <div className="mt-2 font-mono text-[10px] text-[var(--color-muted)]">
 failing call: {pair.after.call}
 </div>
 )}
 </div>
 <div className="bg-[var(--color-panel)] p-3.5">
 <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-ok)]">
 <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-ok)]" />
 after · warden&rsquo;s fix
 </div>
 <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-sm font-semibold leading-relaxed text-[var(--color-ok)]">
 {pair.after
 ? `${pair.after.passed ? "✓ reproduction passes" : "✗ still reproduces"} · exit ${pair.after.code}`
 : "—"}
 </pre>
 {pair.after?.output && (
 <pre className="mt-1.5 max-h-28 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-[var(--color-muted)]">
 {pair.after.output}
 </pre>
 )}
 </div>
 </div>
 );
}
