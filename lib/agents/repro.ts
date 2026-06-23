/**
 * Reproduction-from-event (PLAN §5.3; AUDIT C2; the #1 verification-depth lever).
 *
 * The verification gate can only say "the original error stopped" if it can
 * REPLAY the failing call. For a seeded bug the catalog supplies that; for a
 * REAL incident it has to come from the Sentry event itself; the stack frame
 * (which function blew up, in which module) plus the captured request (the
 * arguments that triggered it). This module turns that signal into the generic
 * `{module, export, args}` descriptor the workspace `reproduceCall` runs.
 *
 * It is intentionally fail-closed: when the signal is incomplete we return null,
 * and the gate escalates rather than recording a vacuous "verified".
 */
import type { ReproDescriptor } from "@/lib/adapters/workspace";

/** The minimal signal extracted from a Sentry event. */
export interface ReproSignal {
 /** Frame filename / issue culprit, e.g. "app:///src/checkout.js". */
 culpritFile?: string | null;
 /** Frame function; the export to invoke, e.g. "computeCheckoutTotal". */
 culpritFunction?: string | null;
 /** The captured request body / arguments that triggered the crash. */
 request?: unknown;
}

/**
 * Normalize a Sentry frame path to a repo-relative module path. Sentry frames
 * carry prefixes like `app:///`, `webpack-internal:///`, `file://`, or a leading
 * `./`; none of which the workspace import resolver wants.
 */
export function normalizeModulePath(file: string): string {
 return file
 .trim()
 .replace(/\\/g, "/") // windows separators
 .replace(/^[a-z-]+:\/\/+/i, "") // app:///, webpack-internal:///, file://
 .replace(/^\.?\//, ""); // leading ./ or /
}

/**
 * Build the generic reproduction descriptor from an event signal. `args` is
 * ALWAYS a positional list: an array request is used as-is; any other value is
 * the single argument, wrapped as `[value]`. Returns null when we can't replay
 * the call (missing function, file, or request) so the gate fails closed.
 */
export function extractReproDescriptor(sig: ReproSignal): ReproDescriptor | null {
 const fn = sig.culpritFunction?.trim();
 const file = sig.culpritFile?.trim();
 if (!fn || !file) return null;
 if (sig.request === undefined || sig.request === null) return null;

 const modulePath = normalizeModulePath(file);
 if (!modulePath || !/\.[cm]?[jt]sx?$/.test(modulePath)) return null; // must be a JS/TS module

 const args = Array.isArray(sig.request) ? sig.request : [sig.request];
 return { module: modulePath, export: fn, args };
}
