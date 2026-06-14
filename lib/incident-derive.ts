/**
 * Derived, non-LLM read-model helpers for the incident detail + fix report:
 * the red→green reproduction pair, the modelled cost of a fix, and a blast-radius
 * estimate. All computed from data the pipeline already records (the event log,
 * the fix attempt, the verification row); no new instrumentation, no model call.
 */
import type { EventRow, FixAttempt, Verification } from "@/lib/db/types";
import { RATE_PER_RUN_USD } from "@/lib/pricing";

export interface ReproPair {
 /** The production error that fired (from the ingest event). */
 before: string | null;
 /** The post-fix reproduction run (from the repro event). */
 after: { passed: boolean; code: number; output: string; call: string } | null;
}

export function reproPair(events: EventRow[]): ReproPair {
 const ingest = events.find((e) => e.type === "ingest");
 // Latest repro event; scan from the end without cloning the array.
 let repro: EventRow | undefined;
 for (let i = events.length - 1; i >= 0; i--) {
 if (events[i].type === "repro") {
 repro = events[i];
 break;
 }
 }
 const ip = (ingest?.payload ?? {}) as { errorType?: unknown; errorMessage?: unknown };
 const before =
 [ip.errorType, ip.errorMessage].filter(Boolean).map(String).join(": ") || null;

 let after: ReproPair["after"] = null;
 if (repro) {
 const p = repro.payload as {
 passed?: boolean;
 code?: number;
 output?: string;
 module?: string;
 export?: string;
 };
 const call = [p.module, p.export].filter(Boolean).join(".");
 after = {
 passed: !!p.passed,
 code: Number(p.code ?? 0),
 output: String(p.output ?? ""),
 call: call ? `${call}()` : "",
 };
 }
 return { before, after };
}

/** Modelled cost of this incident: one rate per logged agent run. */
export function fixCostUsd(events: EventRow[]): number {
 const runs = events.filter((e) => e.type === "agent_action").length;
 return runs * RATE_PER_RUN_USD;
}

export interface MemoryMatch {
 id: string;
 title: string;
 status: string;
 similarity: number;
}

/** Prior incidents pgvector recognized as the same error class (newest first). */
export function memoryMatches(events: EventRow[]): MemoryMatch[] {
 const ev = events.find((e) => e.type === "memory");
 const raw = (ev?.payload as { matches?: MemoryMatch[] } | undefined)?.matches;
 return Array.isArray(raw) ? raw : [];
}

export interface BlastRadius {
 files: string[];
 filesChanged: number;
 regressions: number;
 smokeClean: boolean;
}

export function blastRadius(
 fixAttempt: FixAttempt | null,
 verification: Verification | null): BlastRadius {
 const files = (fixAttempt?.files_changed as string[] | null) ?? [];
 const newErrors = (verification?.new_errors as unknown[] | null) ?? [];
 return {
 files,
 filesChanged: files.length,
 regressions: newErrors.length,
 smokeClean: !!verification && newErrors.length === 0,
 };
}
