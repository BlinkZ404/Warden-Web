/**
 * The orchestrator step runner (PLAN §6, M3/M4/M7/M9).
 *
 * Design rules that make it safe + resumable:
 *  - Stateless: every step re-reads incident state from the DB. Killing the
 *    worker mid-pipeline loses nothing.
 *  - Idempotent: each step checks whether its artifact already exists before
 *    redoing work, and transition() is a no-op if already in the target state.
 *  - One transition per call: the incident can only walk the legal lifecycle;
 *    there is no path that reaches `deploying` without passing verification and
 *    a human approval row.
 *  - Agents have NO deploy authority. The only thing that moves an incident out
 *    of awaiting_approval is a human-written `approvals` row (see lib/approval).
 */
import type { Incident, Review } from "@/lib/db/types";
import { getIncident, setEmbedding, findSimilar } from "@/lib/repo/incidents";
import { listEvents } from "@/lib/repo/events";
import {
  latestInvestigation,
  createInvestigation,
  latestFixAttempt,
  createFixAttempt,
  countFixAttempts,
  listReviews,
  createReview,
  latestVerification,
  createVerification,
  latestDeployment,
  createDeployment,
  markDeploymentPromoted,
  markDeploymentRolledBack,
  recordOutcome,
  getOutcome,
} from "@/lib/repo/artifacts";
import { bumpScorecard } from "@/lib/repo/scorecard";
import { transition, isBoundary } from "@/lib/statemachine";
import { logEvent, logAgentAction, logError } from "@/lib/events";
import { getEmbedder, incidentEmbeddingText } from "@/lib/memory/embeddings";
import { config } from "@/lib/config";
import { getInvestigator } from "@/lib/agents/investigator";
import { getFixer } from "@/lib/agents/fixer";
import { getReviewers } from "@/lib/agents/reviewer";
import type { SentryContext, FixRevision, ReviewFindings } from "@/lib/agents/types";
import {
  prepareWorkspace,
  workspaceExists,
  workspacePath,
  runTests,
  reproduce,
  reproduceCall,
  smokeNewErrors,
  createBranch,
  applyPatch,
  commitAll,
  diffText,
  diffStat,
} from "@/lib/adapters/workspace";
import type { ReproDescriptor } from "@/lib/adapters/workspace";
import type { FixAttempt } from "@/lib/db/types";
import {
  deployPreview,
  promoteToProd,
  rollback,
  verifyProdHealth,
  currentProdDeployment,
} from "@/lib/adapters/deploy";
import { consensusOf, verificationGate, policyGate, deployParityOk } from "@/lib/policy/gate";
import { scopePolicy, approvalsRequired } from "@/lib/runtime-config";
import { extractReproDescriptor } from "@/lib/agents/repro";
import { synthesizeRegressionBattery } from "@/lib/agents/smoke";
import { notifyApprovalNeeded } from "@/lib/notify";
import { getBugByFingerprint } from "@/lib/sim/bugs";

const MIN_CONFIDENCE = 0.5; // §5.8: when uncertain, escalate; don't guess.

// The fix-iterate loop's bound: how many times the Fixer may re-propose after a
// reviewer rejection before the incident escalates to a human (1 initial + 2
// revisions). Keeps the loop from churning or burning cost indefinitely.
const MAX_FIX_ATTEMPTS = 3;

/**
 * The reviewer panel's objection, but only if it is one the Fixer can ACT on.
 * Today that is an over-scoped patch (it touched files unrelated to the error):
 * feeding those notes back yields a tighter re-proposal. A non-scope objection
 * (wrong file, a fundamental doubt) is not auto-actionable, so the caller
 * escalates rather than looping on something the Fixer can't address.
 */
function actionableFeedback(reviews: Review[]): { actionable: boolean; notes: string[] } {
  const notes = new Set<string>();
  let overScoped = false;
  for (const r of reviews) {
    if (r.verdict === "approve") continue;
    const f = r.findings as ReviewFindings | null;
    if (f?.unrelatedFiles?.length) overScoped = true;
    for (const n of f?.notes ?? []) notes.add(n);
  }
  return { actionable: overScoped, notes: [...notes] };
}

/** Reconstruct error context from the ingest event (works in live + sim). */
async function sentryContextFor(incident: Incident): Promise<SentryContext> {
  const events = await listEvents(incident.id);
  const ingest = events.find((e) => e.type === "ingest");
  const p = (ingest?.payload ?? {}) as Record<string, unknown>;
  return {
    externalId: incident.external_id,
    errorType: String(p.errorType ?? "Error"),
    errorMessage: String(p.errorMessage ?? incident.title),
    culpritFile: p.culpritFile as string | undefined,
    culpritFunction: p.culpritFunction as string | undefined,
    triggeringRequest: p.triggeringRequest,
    service: incident.service,
  };
}

/**
 * Ensure the per-incident workspace exists with "production main" (the buggy
 * state). Rebuilds it if a reclaimed job landed on a fresh instance (empty disk).
 */
async function ensureMainWorkspace(
  incident: Incident,
  note = "workspace rebuilt (main)",
): Promise<void> {
  if (await workspaceExists(incident.id)) return;
  await prepareWorkspace(incident.id, getBugByFingerprint(incident.fingerprint));
  await logEvent(incident.id, "workspace", "system", { note });
}

/** Log a failed gate and route the incident to a human (§5.3, §5.8). */
async function escalateGate(
  incidentId: string,
  gate: string,
  reasons: unknown[],
  reason: string,
): Promise<void> {
  await logEvent(incidentId, "gate", "system", { gate, pass: false, reasons });
  await transition(incidentId, "escalated", "system", { reason });
}

/**
 * Ensure the workspace exists AND the fix branch is reconstructed from the
 * persisted patch, so review/verify can resume on a fresh instance instead of
 * escalating (PLAN §6: stateless, resumable).
 */
async function ensureFixWorkspace(incident: Incident, fa: FixAttempt): Promise<void> {
  if (await workspaceExists(incident.id)) return;
  const root = workspacePath(incident.id);
  await prepareWorkspace(incident.id, getBugByFingerprint(incident.fingerprint));
  if (fa.branch) await createBranch(root, fa.branch);
  if (fa.diff) {
    await applyPatch(root, fa.diff);
    await commitAll(root, `fix: rebuilt ${fa.branch ?? "fix branch"}`);
  }
  await logEvent(incident.id, "workspace", "system", {
    note: "workspace rebuilt (fix branch from persisted patch)",
  });
}

// ── per-state steps ──────────────────────────────────────────────────────────

async function stepDetected(incident: Incident) {
  await transition(incident.id, "triaging", "system");
}

async function stepTriaging(incident: Incident) {
  // Embed + store, then check memory: "have we seen this before?" (PLAN §10).
  const embedder = getEmbedder();
  const vec = await embedder.embed(incidentEmbeddingText(incident));
  await setEmbedding(incident.id, vec);

  const similar = await findSimilar(vec, {
    excludeId: incident.id,
    limit: 3,
    minSimilarity: 0.92,
  });
  if (similar.length > 0) {
    await logEvent(incident.id, "memory", "system", {
      seenBefore: true,
      matches: similar.map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        similarity: Number(Number(s.similarity).toFixed(3)),
      })),
      note: "Similar to a past incident (recognized via pgvector).",
    });
  }

  await transition(incident.id, "investigating", "system", {
    embedder: embedder.name,
    seenBefore: similar.length > 0,
  });
}

async function stepInvestigating(incident: Incident) {
  let inv = await latestInvestigation(incident.id);
  if (!inv) {
    const investigator = getInvestigator();
    const sentry = await sentryContextFor(incident);
    const result = await investigator.investigate(incident, sentry);
    const repro = extractReproDescriptor({
      culpritFile: (result.context.culpritFile as string | undefined) ?? sentry.culpritFile,
      culpritFunction: sentry.culpritFunction,
      request: sentry.triggeringRequest,
    });
    inv = await createInvestigation({
      incident_id: incident.id,
      root_cause: result.rootCause,
      confidence: result.confidence,
      context: repro ? { ...result.context, repro } : result.context,
    });
    await logAgentAction(incident.id, investigator.name, "investigated", {
      rootCause: result.rootCause,
      confidence: result.confidence,
    });
  }

  // §5.8 conservative scope: low confidence → escalate, never guess.
  if ((inv.confidence ?? 0) < MIN_CONFIDENCE) {
    await transition(incident.id, "escalated", "system", {
      reason: `investigation confidence ${inv.confidence} below ${MIN_CONFIDENCE}`,
    });
    return;
  }

  // Materialize the isolated workspace (sim injects the bug; live clones the repo).
  await ensureMainWorkspace(
    incident,
    "Isolated git workspace prepared (production state reproduced).",
  );

  await transition(incident.id, "fix_proposed", "claude", {
    confidence: inv.confidence,
  });
}

async function stepFixProposed(incident: Incident) {
  let fa = await latestFixAttempt(incident.id);
  // A revision is needed when the latest attempt was already reviewed and
  // rejected (we looped back from under_review to tighten the fix). Once the new
  // attempt is created it has no reviews, so re-running this step is idempotent.
  const priorReviews = fa ? await listReviews(fa.id) : [];
  const revising = fa != null && priorReviews.some((r) => r.verdict !== "approve");
  if (!fa || revising) {
    const inv = await latestInvestigation(incident.id);
    if (!inv) throw new Error("fix step: investigation missing");
    const fixer = getFixer();
    const root = workspacePath(incident.id);
    let revision: FixRevision | undefined;
    if (revising) {
      // Reset to production state so the re-proposal starts clean (drops whatever
      // the reviewer objected to), then re-propose with the feedback.
      await prepareWorkspace(incident.id, getBugByFingerprint(incident.fingerprint));
      revision = { attempt: priorReviews.length, notes: actionableFeedback(priorReviews).notes };
    } else {
      await ensureMainWorkspace(incident); // rebuild if a reclaimed job lost the disk
    }
    const proposal = await fixer.propose({ incident, investigation: inv, workspaceRoot: root, revision });
    // Persist the patch so the workspace can be rebuilt from DB state later.
    const diff = await diffText(root, "main", proposal.branch);
    fa = await createFixAttempt({
      incident_id: incident.id,
      agent: fixer.name,
      branch: proposal.branch,
      commit_sha: proposal.commitSha,
      diff_summary: proposal.diffSummary,
      files_changed: proposal.filesChanged,
      diff,
    });
    await bumpScorecard(fixer.name, "fixer", { attempts: 1 });
    await logAgentAction(incident.id, fixer.name, "proposed_fix", {
      branch: proposal.branch,
      commit: proposal.commitSha,
      files: proposal.filesChanged,
      summary: proposal.diffSummary,
      ...(revision ? { revisionOf: revision.attempt } : {}),
    });
  }
  await transition(incident.id, "under_review", "claude");
}

async function stepUnderReview(incident: Incident) {
  const fa = await latestFixAttempt(incident.id);
  if (!fa) throw new Error("review step: fix attempt missing");
  await ensureFixWorkspace(incident, fa); // resume on a fresh instance

  const root = workspacePath(incident.id);
  const stat = await diffStat(root, "main", fa.branch!);
  const scope = policyGate(
    { files: stat.files, filesChanged: stat.filesChanged, churn: stat.insertions + stat.deletions },
    scopePolicy(),
  );
  if (!scope.pass) {
    await escalateGate(
      incident.id,
      "scope",
      scope.reasons,
      `fix scope policy failed: ${scope.reasons.join("; ")}`,
    );
    return;
  }

  // Run the reviewer PANEL (1–3 independent reviewers, ideally different model
  // families). Idempotent: only run reviewers that haven't recorded a row yet.
  const reviewers = getReviewers();
  const done = new Set((await listReviews(fa.id)).map((r) => r.reviewer_agent));
  const todo = reviewers.filter((r) => !done.has(r.name));
  if (todo.length > 0) {
    const inv = await latestInvestigation(incident.id);
    const culpritFile = (inv?.context as { culpritFile?: string } | null)?.culpritFile;
    const reviewed = await Promise.all(
      todo.map((reviewer) =>
        reviewer
          .review({
            incident,
            fixAttempt: fa,
            workspaceRoot: workspacePath(incident.id),
            baseRef: "main",
            headRef: fa.branch!,
            culpritFile,
          })
          .then((result) => ({ reviewer, result })),
      ),
    );
    for (const { reviewer, result } of reviewed) {
      const row = await createReview({
        fix_attempt_id: fa.id,
        reviewer_agent: reviewer.name,
        verdict: result.verdict,
        findings: result.findings,
      });
      // Null = a concurrent/replayed run already recorded this reviewer; skip
      // so the scorecard isn't double-counted (the DB unique index is the guard).
      if (!row) continue;
      await bumpScorecard(reviewer.name, "reviewer", { attempts: 1 });
      await logAgentAction(incident.id, reviewer.name, "reviewed", {
        verdict: result.verdict,
        summary: result.summary,
        notes: result.findings.notes,
        scope: result.findings.scope,
      });
    }
  }

  // Consensus is a FILTER: disagreement → escalate, never auto-handle (§5.4).
  const reviews = await listReviews(fa.id);
  const consensus = consensusOf(
    reviews.map((r) => ({ name: r.reviewer_agent, verdict: r.verdict })),
    approvalsRequired(),
  );
  await logEvent(incident.id, "consensus", "system", {
    proceed: consensus.proceed,
    approvals: consensus.approvals,
    total: consensus.total,
    required: consensus.required,
    reason: consensus.reason,
  });
  if (consensus.escalate) {
    // Iterate before escalating: if the objection is something the Fixer can act
    // on (an over-scoped patch) and we haven't spent our attempts, send the
    // feedback back for a tighter fix instead of handing it to a human. The
    // deterministic verification gate still runs after; this only addresses the
    // reviewer filter, it never ships on agreement.
    const attempts = await countFixAttempts(incident.id);
    const fb = actionableFeedback(reviews);
    if (fb.actionable && attempts < MAX_FIX_ATTEMPTS) {
      await logEvent(incident.id, "revision", "system", {
        attempt: attempts,
        reason: "reviewer flagged an over-scoped fix; re-proposing with the feedback",
        notes: fb.notes,
      });
      await transition(incident.id, "fix_proposed", "claude", { revision: attempts });
      return;
    }
    await transition(incident.id, "escalated", "system", {
      reason:
        attempts >= MAX_FIX_ATTEMPTS
          ? `${consensus.reason}; escalated after ${attempts} attempts`
          : consensus.reason,
    });
    return;
  }
  await transition(incident.id, "verifying", "system");
}

async function stepVerifying(incident: Incident) {
  const fa = await latestFixAttempt(incident.id);
  if (!fa) throw new Error("verify step: fix attempt missing");
  await ensureFixWorkspace(incident, fa); // resume on a fresh instance

  let v = await latestVerification(fa.id);
  if (!v) {
    const root = workspacePath(incident.id);
    const bug = getBugByFingerprint(incident.fingerprint);

    // Deploy a preview of the EXACT verified commit (PLAN §7). The REAL gate
    // (below) runs against the tree.
    const preview = await deployPreview(incident.id, { ref: fa.commit_sha ?? undefined });
    await createDeployment({
      fix_attempt_id: fa.id,
      provider: preview.provider,
      deployment_id: preview.deploymentId,
      preview_url: preview.previewUrl,
      prod_url: null,
      built_commit_sha: fa.commit_sha ?? null,
    });

    // Deterministic gate (§5.3): tests + does the original error still reproduce?
    const tests = await runTests(root);
    const testsCollected = tests.testsRun ?? 0;
    // `node --test` exits 0 even with ZERO test files; never treat that as a pass.
    const suitePassed = tests.code === 0 && testsCollected > 0;

    // Reproduce the original error against the fixed tree. Prefer the generic
    // descriptor carried on the investigation (the live seam: culprit export +
    // captured args) and fall back to the seeded catalog scenario. Either way
    // the signal is real: did the production-failing call stop throwing?
    const inv = await latestInvestigation(incident.id);
    const descriptor = (inv?.context as { repro?: ReproDescriptor } | null)?.repro;
    let errorRecurred = false;
    let reproChecked = false;
    if (descriptor) {
      const repro = await reproduceCall(root, descriptor);
      errorRecurred = repro.code !== 0;
      reproChecked = true;
    } else if (bug) {
      const repro = await reproduce(root, bug.reproScenario, bug.triggeringInput);
      errorRecurred = repro.code !== 0;
      reproChecked = true;
    }

    // Fail closed (§5.8): if we could neither run any tests nor reproduce the
    // original error, the fix is NOT honestly verified; escalate instead of
    // recording a vacuous pass. Reaches here for a real live incident whose
    // target has no tests and no reproduction harness yet (see docs/operations/go-live.md).
    if (!reproChecked && testsCollected === 0) {
      await escalateGate(
        incident.id,
        "verification",
        ["could not verify: no tests collected and no reproduction available"],
        "verification not possible: no tests and no reproduction harness",
      );
      return;
    }

    // A real suite is the gold signal. For a test-less repo (the vibe-coded
    // majority) we synthesize it from the event: if the captured production-failing
    // request stopped throwing, that reproduction stands in for the absent suite.
    const verifiedViaRepro = reproChecked && !errorRecurred;
    const synthesized = !suitePassed && testsCollected === 0 && verifiedViaRepro;
    const testPassed = suitePassed || synthesized;

    // No-new-errors battery. Seeded incidents carry known-good inputs; a real
    // test-less incident gets a baseline-checked battery synthesized from the
    // captured request (an input only counts as a regression if it throws on the
    // fix but ran clean on the pre-fix tree).
    let newErrors: string[] = [];
    let smokeMode: "seeded" | "synthesized" | "none" = "none";
    const smokeDescriptor =
      descriptor ??
      (bug?.repro
        ? { module: bug.repro.module, export: bug.repro.export, args: bug.repro.args }
        : null);
    if (smokeDescriptor && bug?.smokeInputs?.length) {
      newErrors = await smokeNewErrors(root, smokeDescriptor, bug.smokeInputs);
      smokeMode = "seeded";
    } else if (synthesized && descriptor) {
      const battery = await synthesizeRegressionBattery(root, descriptor, "main", fa.branch!);
      newErrors = battery.newErrors;
      smokeMode = battery.inputs > 0 ? "synthesized" : "none";
    }

    v = await createVerification({
      fix_attempt_id: fa.id,
      preview_url: preview.previewUrl,
      test_passed: testPassed,
      error_recurred: errorRecurred,
      new_errors: newErrors,
    });
    await logEvent(incident.id, "verification", "system", {
      preview_url: preview.previewUrl,
      test_passed: testPassed,
      tests_collected: testsCollected,
      verified_via: suitePassed ? "suite" : synthesized ? "synthesized-repro" : "none",
      smoke_mode: smokeMode,
      error_recurred: errorRecurred,
      repro_checked: reproChecked,
      new_errors: newErrors.length,
    });
  }

  const gate = verificationGate({
    test_passed: !!v.test_passed,
    error_recurred: !!v.error_recurred,
    new_errors: (v.new_errors as unknown[]) ?? [],
  });

  if (!gate.pass) {
    await escalateGate(
      incident.id,
      "verification",
      gate.reasons,
      `verification failed: ${gate.reasons.join("; ")}`,
    );
    return;
  }

  await bumpScorecard(fa.agent, "fixer", { verified_passed: 1 });
  await logEvent(incident.id, "gate", "system", {
    gate: "verification",
    pass: true,
    reasons: gate.reasons,
  });
  await transition(incident.id, "awaiting_approval", "system");

  // Ping the founder: readable summary + a one-tap approval link (§8).
  await notifyApprovalNeeded({
    incidentId: incident.id,
    title: `Found a fix for the ${incident.service ?? "app"} crash`,
    body: fa.diff_summary ?? "A fix is ready and passed verification.",
  });
}

async function stepApproved(incident: Incident) {
  // Human consent recorded (lib/approval). Begin promotion.
  await transition(incident.id, "deploying", "system");
}

async function stepDeploying(incident: Incident) {
  const fa = await latestFixAttempt(incident.id);
  if (!fa) throw new Error("deploy step: fix attempt missing");
  const dep = await latestDeployment(fa.id);

  // Idempotent: if this deployment was already promoted (a crash-retry, or a
  // racing worker got here first), do NOT promote again; just advance. Prevents
  // a double production promotion (PLAN §5 reversibility / no duplicate ship).
  if (dep?.promoted_at) {
    await transition(incident.id, "verifying_prod", "system", {
      prodUrl: dep.prod_url,
      note: "already promoted",
    });
    return;
  }

  if (!deployParityOk(fa.commit_sha, dep?.built_commit_sha)) {
    await escalateGate(
      incident.id,
      "deploy-parity",
      ["built commit does not match verified commit"],
      "deploy parity failed: the deployment was not built from the verified commit",
    );
    return;
  }

  // Capture the current-good production deployment BEFORE promoting, so a later
  // rollback restores to it (not to the deployment we're about to ship).
  const prevProd = await currentProdDeployment();
  const promo = await promoteToProd(dep?.deployment_id ?? `dpl_sim_${incident.id.slice(0, 8)}`);
  if (dep) await markDeploymentPromoted(dep.id, promo.prodUrl, prevProd);
  await logEvent(incident.id, "deploy", "system", {
    promoted: true,
    prodUrl: promo.prodUrl,
  });
  await transition(incident.id, "verifying_prod", "system", { prodUrl: promo.prodUrl });
}

async function stepVerifyingProd(incident: Incident) {
  const fa = await latestFixAttempt(incident.id);
  if (!fa) throw new Error("verify-prod step: fix attempt missing");
  const dep = await latestDeployment(fa.id);
  const bug = getBugByFingerprint(incident.fingerprint);

  const health = await verifyProdHealth({ simulateRegression: bug?.simProdRegresses });

  // Health couldn't be determined (live, no real signal yet) → escalate for
  // human confirmation rather than auto-resolving an unverified prod state.
  if (health.unverifiable) {
    await escalateGate(
      incident.id,
      "prod-health",
      health.newErrors,
      "production health could not be verified; needs human confirmation",
    );
    return;
  }

  if (!health.healthy) {
    // Roll back TO the previous-good production deployment (NOT the bad one we
    // just shipped). In sim there is no prior prod, so this is a no-op.
    await rollback(dep?.prev_prod_deployment_id ?? "");
    if (dep) await markDeploymentRolledBack(dep.id);
    await bumpScorecard(fa.agent, "fixer", { regressions: 1 });
    await logEvent(incident.id, "rollback", "system", {
      reason: "production error-rate spike after promotion",
      errorRateDelta: health.errorRateDelta,
      newErrors: health.newErrors,
    });
    await transition(incident.id, "rolled_back", "system", {
      reason: "prod regression detected; instant rollback",
    });
    return;
  }

  await recordOutcome({
    incident_id: incident.id,
    resolved: true,
    recurred: false,
    resolution_type: "code",
    notes: "Fixed, verified on preview, approved, and healthy in production.",
  });
  await logEvent(incident.id, "outcome", "system", {
    resolved: true,
    prodHealthy: true,
  });
  await transition(incident.id, "resolved", "system");
}

async function stepRolledBack(incident: Incident) {
  // The rollback IS the resting state: a human reviews rolled-back incidents from
  // the dashboard, so record the outcome once and stop. Escalating on top of an
  // already-reverted incident only read as a confusing "escalated" status that
  // disagreed with the revert metric. Guarded because recordOutcome isn't an
  // upsert and this state can be re-entered on a reclaimed job.
  if (!(await getOutcome(incident.id))) {
    await recordOutcome({
      incident_id: incident.id,
      resolved: false,
      recurred: true,
      resolution_type: "none",
      notes: "Auto-rolled back after a production regression; needs human follow-up.",
    });
  }
}

// ── dispatcher ───────────────────────────────────────────────────────────────

export interface AdvanceResult {
  from: Incident["status"];
  to: Incident["status"];
  progressed: boolean;
}

/** Perform exactly one step of work for an incident, based on its current state. */
export async function advanceIncident(incidentId: string): Promise<AdvanceResult> {
  const incident = await getIncident(incidentId);
  if (!incident) throw new Error(`advanceIncident: incident not found ${incidentId}`);
  const from = incident.status;

  switch (from) {
    case "detected":
      await stepDetected(incident);
      break;
    case "triaging":
      await stepTriaging(incident);
      break;
    case "investigating":
      await stepInvestigating(incident);
      break;
    case "fix_proposed":
      await stepFixProposed(incident);
      break;
    case "under_review":
      await stepUnderReview(incident);
      break;
    case "verifying":
      await stepVerifying(incident);
      break;
    case "approved":
      await stepApproved(incident);
      break;
    case "deploying":
      await stepDeploying(incident);
      break;
    case "verifying_prod":
      await stepVerifyingProd(incident);
      break;
    case "rolled_back":
      await stepRolledBack(incident);
      break;
    default:
      // awaiting_approval / escalated / resolved / failed / dismissed: nothing to do.
      break;
  }

  const after = await getIncident(incidentId);
  const to = after!.status;
  return { from, to, progressed: to !== from };
}

/**
 * Drive an incident through automated steps until it hits a boundary: a human
 * gate (awaiting_approval), an escalation, or a terminal state. Bounded to
 * avoid runaway loops.
 */
export async function runIncidentToBoundary(
  incidentId: string,
  opts: { maxSteps?: number; heartbeat?: () => Promise<boolean> } = {},
): Promise<Incident["status"]> {
  const maxSteps = opts.maxSteps ?? 40;
  for (let i = 0; i < maxSteps; i++) {
    if (opts.heartbeat && !(await opts.heartbeat())) {
      // Lost our lease; another worker now owns this job. Stop cleanly.
      return (await getIncident(incidentId))!.status;
    }
    const current = await getIncident(incidentId);
    if (!current) throw new Error("incident vanished");
    if (isBoundary(current.status)) return current.status;
    const { to, progressed } = await advanceIncident(incidentId);
    if (!progressed) return to; // stuck / boundary
  }
  const final = await getIncident(incidentId);
  await logError(incidentId, "system", "runIncidentToBoundary hit maxSteps", {
    status: final?.status,
  });
  return final!.status;
}
