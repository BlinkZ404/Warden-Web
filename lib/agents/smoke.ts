/**
 * Synthesized verification for test-less repos (the vibe-coded-majority gap).
 *
 * The verification gate's strongest signal is "the production-failing request no
 * longer throws", which the event-derived repro descriptor (`lib/agents/repro.ts`)
 * already gives us. But the gate also wants a *suite* to prove the fix didn't
 * break neighbouring inputs, and the apps this product targets overwhelmingly
 * ship with no tests, so `node --test` collects nothing and the incident escalates
 * for lack of a suite alone.
 *
 * So for a test-less incident we SYNTHESIZE the missing battery from the one input
 * we always have: the captured failing request. We derive a handful of
 * conservative variations, then run each on BOTH the pre-fix tree and the fixed
 * tree and count only the ones that newly throw on the fix. Baselining against the
 * buggy tree is what makes this sound: an input that already threw (because of the
 * bug, or because it is genuinely invalid) is never mistaken for a regression the
 * fix introduced.
 */
import {
  reproduceCall,
  checkoutRef,
  throwSignature,
  type ReproDescriptor,
} from "@/lib/adapters/workspace";

/**
 * A deterministic, conservative set of variations of the captured positional
 * args. The original args are always first (so a cap never drops them), followed
 * by single-field perturbations of the leading argument: the field absent, the
 * field null, an empty collection, a single-element collection, an empty string,
 * or zero / negative numbers. These are the inputs that most often expose a fix
 * that "works for the reported case but throws on the neighbours".
 */
export function synthesizeSmokeInputs(args: unknown[]): unknown[][] {
  const out: unknown[][] = [];
  const seen = new Set<string>();
  const push = (a: unknown[]) => {
    const k = JSON.stringify(a);
    if (k != null && !seen.has(k)) {
      seen.add(k);
      out.push(a);
    }
  };

  // Always exercise the captured request itself (must succeed on the fix).
  push([...args]);

  const head = args[0];
  const rest = args.slice(1);
  if (head && typeof head === "object" && !Array.isArray(head)) {
    const obj = head as Record<string, unknown>;
    for (const key of Object.keys(obj).slice(0, 4)) {
      const without = { ...obj };
      delete without[key];
      push([without, ...rest]); // a field the original carried is now absent
      push([{ ...obj, [key]: null }, ...rest]); // ... or explicitly null
    }
  } else if (Array.isArray(head)) {
    push([[], ...rest]); // empty collection
    if (head.length > 1) push([[head[0]], ...rest]); // single element
  } else if (typeof head === "string") {
    push(["", ...rest]);
  } else if (typeof head === "number") {
    push([0, ...rest]);
    push([-1, ...rest]);
  }

  return out.slice(0, 8);
}

export interface SynthResult {
  /** How many synthesized variations were actually exercised. */
  inputs: number;
  /** Throw signatures introduced by the fix (clean on baseline, throwing on fix). */
  newErrors: string[];
}

/** The throw signature for one input on the currently checked-out tree (null = clean). */
async function signatureOf(
  root: string,
  descriptor: ReproDescriptor,
  args: unknown[],
): Promise<string | null> {
  return throwSignature(await reproduceCall(root, { ...descriptor, args }));
}

/**
 * Baseline-checked regression battery. Runs each synthesized input on `baseRef`
 * (the pre-fix / buggy tree) and on `fixRef`, and flags only inputs that throw on
 * the fix but ran clean on the baseline. Restores the workspace to `fixRef` before
 * returning so later steps see the verified tree.
 */
export async function synthesizeRegressionBattery(
  root: string,
  descriptor: ReproDescriptor,
  baseRef: string,
  fixRef: string,
): Promise<SynthResult> {
  const inputs = synthesizeSmokeInputs(descriptor.args);
  if (inputs.length === 0) return { inputs: 0, newErrors: [] };

  await checkoutRef(root, baseRef);
  try {
    const baseline: (string | null)[] = [];
    for (const args of inputs) baseline.push(await signatureOf(root, descriptor, args));

    await checkoutRef(root, fixRef);
    const newErrors = new Set<string>();
    for (let i = 0; i < inputs.length; i++) {
      const sig = await signatureOf(root, descriptor, inputs[i]);
      if (sig && baseline[i] === null) newErrors.add(sig); // threw on fix, clean on baseline
    }
    return { inputs: inputs.length, newErrors: [...newErrors] };
  } finally {
    // Always leave the workspace on the verified fix tree, even if a reproduce run
    // throws mid-battery, so a resumed step never reads the pre-fix (buggy) tree.
    await checkoutRef(root, fixRef).catch(() => {});
  }
}
