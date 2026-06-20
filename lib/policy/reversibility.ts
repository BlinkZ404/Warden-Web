/**
 * Reversibility classification for the consent moment (PLAN §8; the trust model).
 *
 * A non-technical founder approves a fix they cannot read, so the contract is not
 * "this code is correct" but "you can undo this in one tap". That promise only
 * fully holds for a CODE-ONLY change: a deploy rollback re-points the app at the
 * previous build, but it cannot un-run a database migration or restore data a
 * schema change rewrote. So before the founder taps, we tell them honestly whether
 * the one-tap revert is data-safe.
 *
 * In practice the conservative-patch boundary (`DEFAULT_DENY_GLOBS`) already keeps
 * the Fixer off migrations, schema, and data, so an auto-generated fix is reversible
 * by construction; this surfaces that guarantee as a visible trust signal, and stays
 * honest for any future path (live mode, a human-authored patch) that does touch
 * schema or data.
 */
import { pathMatchesGlob, DATA_SCHEMA_GLOBS } from "@/lib/policy/gate";

/**
 * File classes a code-only revert cannot undo: schema and data outlive the
 * deploy. Shared with the deny-glob floor so the two never drift apart.
 */
export const IRREVERSIBLE_GLOBS: string[] = DATA_SCHEMA_GLOBS;

export interface Reversibility {
  reversible: boolean;
  label: string;
  detail: string;
}

export function classifyReversibility(files: string[]): Reversibility {
  const offending = (files ?? []).filter((f) =>
    IRREVERSIBLE_GLOBS.some((g) => pathMatchesGlob(f, g)),
  );
  if (offending.length === 0) {
    return {
      reversible: true,
      label: "Fully reversible",
      detail:
        "Code-only fix. One tap restores your app exactly; there are no database changes to undo.",
    };
  }
  return {
    reversible: false,
    label: "Not fully reversible",
    detail:
      "This fix changes schema or data, so a one-tap revert rolls back the code but not the database. Review before shipping.",
  };
}
