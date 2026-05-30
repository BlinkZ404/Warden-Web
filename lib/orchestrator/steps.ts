/**
 * The orchestrator step runner (PLAN §6, M3/M4/M7/M9).
 *
 * Design rules that make it safe + resumable:
 *  - Stateless: every step re-reads incident state from the DB. Killing the
 *    worker mid-pipeline loses nothing.
 *  - Idempotent: each step checks whether its artifact already exists before
 *    redoing work, and transition() is a no-op if already in the target state.
 *  - One transition per call: the incident can only walk the legal lifecycle —
 *    there is no path that reaches `deploying` without passing verification and
 *    a human approval row.
 *  - Agents have NO deploy authority. The only thing that moves an incident out
 *    of awaiting_approval is a human-written `approvals` row (see lib/approval).
 */
import type { Incident } from "@/lib/db/types";
import { getIncident, setEmbedding, findSimilar } from "@/lib/repo/incidents";
import { listEvents } from "@/lib/repo/events";
import {
  latestInvestigation,
  createInvestigation,
  latestFixAttempt,
  createFixAttempt,
  listReviews,
  createReview,
  latestVerification,
  createVerification,
  latestDeployment,
  createDeployment,
  markDeploymentPromoted,
  markDeploymentRolledBack,
  recordOutcome,
} from "@/lib/repo/artifacts";
import { bumpScorecard } from "@/lib/repo/scorecard";
import { transition, isBoundary } from "@/lib/statemachine";
import { logEvent, logAgentAction, logError } from "@/lib/events";
import { getEmbedder, incidentEmbeddingText } from "@/lib/memory/embeddings";
import { config } from "@/lib/config";
import { getInvestigator } from "@/lib/agents/investigator";
import { getFixer } from "@/lib/agents/fixer";
import { getReviewers } from "@/lib/agents/reviewer";
import type { SentryContext } from "@/lib/agents/types";
import {
  prepareWorkspace,
  workspaceExists,
  workspacePath,
  runTests,
  reproduce,
  createBranch,
  applyPatch,
  commitAll,
  diffText,
} from "@/lib/adapters/workspace";
import type { FixAttempt } from "@/lib/db/types";
import {
  deployPreview,
  promoteToProd,
  rollback,
  verifyProdHealth,
  currentProdDeployment,
} from "@/lib/adapters/deploy";
import { consensusOf, verificationGate } from "@/lib/policy/gate";
import { notifyApprovalNeeded } from "@/lib/notify";
import { getBugByFingerprint } from "@/lib/sim/bugs";

const MIN_CONFIDENCE = 0.5; // §5.8: when uncertain, escalate — don't guess.

/** Reconstruct error context from the ingest event (works in live + sim). */
async function sentryContextFor(incident: Incident): Promise<SentryContext> {
  const events = await listEvents(incident.id);
  const ingest = events.find((e) => e.type === "ingest");
  const p = (ingest?.payload ?? {}) as Record<string, string>;
  return {
    externalId: incident.external_id,
    errorType: p.errorType ?? "Error",
    errorMessage: p.errorMessage ?? incident.title,
    culpritFile: p.culpritFile,
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
 * persisted patch — so review/verify can resume on a fresh instance instead of
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
      note: "Similar to a past incident — recognized via pgvector.",
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
    const result = await investigator.investigate(
      incident,
      await sentryContextFor(incident),
    );
    inv = await createInvestigation({
      incident_id: incident.id,
      root_cause: result.rootCause,
      confidence: result.confidence,
      context: result.context,
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
  if (!fa) {
    const inv = await latestInvestigation(incident.id);
    if (!inv) throw new Error("fix step: investigation missing");
    await ensureMainWorkspace(incident); // rebuild if a reclaimed job lost the disk
    const fixer = getFixer();
    const root = workspacePath(incident.id);
    const proposal = await fixer.propose({
      incident,
      investigation: inv,
      workspaceRoot: root,
    });
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
    });
  }
  await transition(incident.id, "under_review", "claude");
}

async function stepUnderReview(incident: Incident) {
  const fa = await latestFixAttempt(incident.id);
  if (!fa) throw new Error("review step: fix attempt missing");
  await ensureFixWorkspace(incident, fa); // resume on a fresh instance

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
      // Null = a concurrent/replayed run already recorded this reviewer — skip
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
    config.review.approvalsRequired,
  );
  await logEvent(incident.id, "consensus", "system", {
    proceed: consensus.proceed,
    approvals: consensus.approvals,
    total: consensus.total,
    required: consensus.required,
    reason: consensus.reason,
  });
  if (consensus.escalate) {
    await transition(incident.id, "escalated", "system", { reason: consensus.reason });
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
    });

    // Deterministic gate (§5.3): tests + does the original error still reproduce?
    const tests = await runTests(root);
    const testsCollected = tests.testsRun ?? 0;
    // `node --test` exits 0 even with ZERO test files — never treat that as a pass.
    const testPassed = tests.code === 0 && testsCollected > 0;

    let errorRecurred = false;
    let reproChecked = false;
    if (bug) {
      const repro = await reproduce(root, bug.reproScenario, bug.triggeringInput);
      errorRecurred = repro.code !== 0;
      reproChecked = true;
    }

    // Fail closed (§5.8): if we could neither run any tests nor reproduce the
    // original error, the fix is NOT honestly verified — escalate instead of
    // recording a vacuous pass. Reaches here for a real live incident whose
    // target has no tests and no reproduction harness yet (see GO-LIVE.md).
    if (!reproChecked && testsCollected === 0) {
      await escalateGate(
        incident.id,
        "verification",
        ["could not verify: no tests collected and no reproduction available"],
        "verification not possible — no tests and no reproduction harness",
      );
      return;
    }

    // new_errors stays empty until a live error-signal source is wired (GO-LIVE);
    // the UI surfaces this as "no new errors detected", not an affirmative check.
    const newErrors: string[] = [];

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

  // Ping the founder: plain-English summary + a one-tap approval link (§8).
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
  // racing worker got here first), do NOT promote again — just advance. Prevents
  // a double production promotion (PLAN §5 reversibility / no duplicate ship).
  if (dep?.promoted_at) {
    await transition(incident.id, "verifying_prod", "system", {
      prodUrl: dep.prod_url,
      note: "already promoted",
    });
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
      "production health could not be verified — needs human confirmation",
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
  await recordOutcome({
    incident_id: incident.id,
    resolved: false,
    recurred: true,
    resolution_type: "none",
    notes: "Auto-rolled back after a production regression; needs human follow-up.",
  });
  await transition(incident.id, "escalated", "system", {
    reason: "rolled back; awaiting human decision",
  });
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
      // Lost our lease — another worker now owns this job. Stop cleanly.
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
