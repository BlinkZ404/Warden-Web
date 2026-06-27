"use client";

import { useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { IncidentBundle } from "@/lib/view";
import { StatusBadge, PipelineBar, VerdictPill } from "@/app/_components/ui";
import {
 Frame,
 Grid,
 Cell,
 Field,
 Label,
 Plus,
 Button,
 Chip,
 PageHeader,
 ExternalLink,
 Loading,
 Empty,
} from "@/app/_components/console";
import { Icon } from "@/app/_components/icons";
import { ReproTheater } from "@/app/_components/repro-theater";
import { AuditTable } from "@/app/_components/audit-table";
import { reproPair, fixCostUsd, blastRadius, memoryMatches } from "@/lib/incident-derive";
import { classifyReversibility } from "@/lib/policy/reversibility";
import { usd } from "@/lib/pricing";
import { canTransition } from "@/lib/statemachine/transitions";
import { actorLabel } from "@/app/_components/brand";

export default function IncidentDetail() {
 const { id } = useParams<{ id: string }>();
 const [bundle, setBundle] = useState<IncidentBundle | null>(null);
 const [loaded, setLoaded] = useState(false);
 const [busy, setBusy] = useState(false);

 const load = useCallback(async () => {
 try {
 const res = await fetch(`/api/incidents/${id}`, { cache: "no-store" });
 if (res.ok) setBundle(await res.json());
 else if (res.status === 404) setBundle(null);
 } catch {
 // transient failure: keep the last-good bundle on screen
 } finally {
 setLoaded(true);
 }
 }, [id]);

 useEffect(() => {
 load();
 const t = setInterval(load, 2500);
 return () => clearInterval(t);
 }, [load]);

 async function decide(decision: "approve" | "reject") {
 setBusy(true);
 try {
 await fetch(`/api/incidents/${id}/approve`, {
 method: "POST",
 headers: { "content-type": "application/json" },
 body: JSON.stringify({ decision, decidedBy: "founder" }),
 });
 await load();
 } finally {
 setBusy(false);
 }
 }

 async function revert() {
 setBusy(true);
 try {
 await fetch(`/api/incidents/${id}/rollback`, {
 method: "POST",
 headers: { "content-type": "application/json" },
 body: JSON.stringify({ decidedBy: "founder" }),
 });
 await load();
 } finally {
 setBusy(false);
 }
 }

 async function dismiss() {
 setBusy(true);
 try {
 await fetch(`/api/incidents/${id}/dismiss`, { method: "POST" });
 await load();
 } finally {
 setBusy(false);
 }
 }

 if (!loaded) return <Loading />;
 if (!bundle) return <Empty>Incident not found. It may have been cleared.</Empty>;

 const { incident, investigation, fixAttempt, reviews, verification, deployment, outcome, events } =
 bundle;
 const approvals = reviews.filter((r) => r.verdict === "approve").length;
 const awaiting = incident.status === "awaiting_approval";
 const blast = blastRadius(fixAttempt, verification);
 const rev = classifyReversibility(blast.files);
 const cost = fixCostUsd(events);
 const memory = memoryMatches(events);
 const invActor = events.find(
 (e) => e.type === "agent_action" && (e.payload as { action?: string } | null)?.action === "investigated",
 )?.actor;

 const arts: { key: string; icon: string; title: string; aside?: string; body: ReactNode }[] = [];
 if (memory.length > 0)
 arts.push({
 key: "mem",
 icon: "activity",
 title: "Memory",
 aside: "pgvector",
 body: (
 <>
 <p className="text-sm leading-relaxed">
 Recognized via pgvector. Warden has handled this error class before and gets more
 accurate on your codebase over time.
 </p>
 <div className="mt-3 space-y-2 border-t border-[var(--color-line)] pt-2.5">
 {memory.map((m) => (
 <div key={m.id} className="flex items-center justify-between gap-3 text-xs">
 <span className="min-w-0 truncate text-[var(--color-text)]">{m.title}</span>
 <span className="flex shrink-0 items-center gap-2 font-mono">
 <span className="text-[var(--color-muted)]">
 {Math.round(m.similarity * 100)}% match
 </span>
 <MemOutcome status={m.status} />
 </span>
 </div>
 ))}
 </div>
 </>
 ),
 });
 if (investigation)
 arts.push({
 key: "inv",
 icon: "search",
 title: "Investigation",
 aside: invActor ? actorLabel(invActor) : undefined,
 body: (
 <>
 <p className="text-sm leading-relaxed">{investigation.root_cause}</p>
 <div className="mt-3 border-t border-[var(--color-line)] pt-2.5">
 <Field
 label="conf"
 value={`${Math.round((investigation.confidence ?? 0) * 100)}%`}
 accent
 />
 </div>
 </>
 ),
 });
 if (fixAttempt)
 arts.push({
 key: "fix",
 icon: "code",
 title: "Fix proposed",
 aside: actorLabel(fixAttempt.agent),
 body: (
 <>
 <p className="text-sm leading-relaxed">{fixAttempt.diff_summary}</p>
 <div className="mt-3 border-t border-[var(--color-line)] pt-2.5">
 <Field label="branch" value={fixAttempt.branch ?? "—"} accent />
 <Field
 label="files"
 value={(fixAttempt.files_changed as string[] | null)?.join(", ") ?? "—"}
 />
 </div>
 </>
 ),
 });
 if (reviews.length > 0)
 arts.push({
 key: "rev",
 icon: "eye",
 title: "Reviewer panel",
 aside: `${approvals}/${reviews.length} approved`,
 body: (
 <div className="space-y-3">
 {reviews.map((r) => (
 <div
 key={r.id}
 className="border-t border-[var(--color-line)] pt-2.5 first:border-0 first:pt-0"
 >
 <div className="flex items-center justify-between">
 <Label>{r.reviewer_agent}</Label>
 <VerdictPill verdict={r.verdict} />
 </div>
 <ul className="mt-1.5 space-y-1 text-xs text-[var(--color-muted)]">
 {((r.findings as { notes?: string[] })?.notes ?? []).map((n, i) => (
 <li key={i} className="flex gap-1.5">
 <span className="text-[var(--color-brand-2)]">→</span>
 <span>{n}</span>
 </li>
 ))}
 </ul>
 </div>
 ))}
 </div>
 ),
 });
 if (verification)
 arts.push({
 key: "ver",
 icon: "shieldCheck",
 title: "Verification gate",
 aside: "automated",
 body: (
 <>
 <div className="space-y-1.5 font-mono text-sm">
 <Check ok={!!verification.test_passed} label="tests pass" />
 <Check ok={!verification.error_recurred} label="original error stopped" />
 <Check
 ok={!(verification.new_errors as unknown[] | null)?.length}
 label="no new errors detected"
 />
 </div>
 <ReproTheater pair={reproPair(events)} />
 {verification.preview_url && (
 <div className="mt-3 border-t border-[var(--color-line)] pt-2.5">
 <Field label="preview" value={verification.preview_url} accent />
 </div>
 )}
 </>
 ),
 });
 if (deployment) {
 const simDeploy = deployment.deployment_id?.startsWith("dpl_sim_") ?? false;
 arts.push({
 key: "dep",
 icon: "deploy",
 title: "Deployment",
 aside: simDeploy ? "simulated" : "vercel",
 body: (
 <>
 {deployment.prod_url && <Field label="prod" value={deployment.prod_url} accent />}
 <Field
 label="preview"
 value={simDeploy ? "simulated (no Vercel connected)" : deployment.preview_url ?? "—"}
 accent={!simDeploy}
 />
 {deployment.rolled_back && (
 <p className="mt-2 font-mono text-xs text-[var(--color-warn)]">↺ auto-rolled back</p>
 )}
 </>
 ),
 });
 }
 if (outcome)
 arts.push({
 key: "out",
 icon: "flag",
 title: "Outcome",
 body: (
 <>
 <Field label="resolved" value={String(outcome.resolved)} />
 <Field label="type" value={outcome.resolution_type ?? "—"} />
 {outcome.notes && (
 <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted)]">{outcome.notes}</p>
 )}
 </>
 ),
 });

 return (
 <div>
 <PageHeader
 title={
 <span className="text-[var(--color-muted)]">
 <Link href="/dashboard" className="transition hover:text-[var(--color-text)]">
 incidents
 </Link>{" "}
 <span className="opacity-40">/</span>{" "}
 <span className="text-[var(--color-text)]">{id?.slice(0, 8)}</span>
 </span>
 }
 aside={
 <>
 {(incident.status === "resolved" || incident.status === "rolled_back") && (
 <ExternalLink href={`/report/${id}`} className="font-mono text-[11px]">
 fix report ↗
 </ExternalLink>
 )}
 {canTransition(incident.status, "dismissed") && (
 <button
 onClick={dismiss}
 disabled={busy}
 className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-muted)] transition hover:text-[var(--color-bad)] disabled:opacity-50"
 >
 dismiss
 </button>
 )}
 <StatusBadge status={incident.status} />
 </>
 }
 />

 <div className="px-7 py-6">
 <h1 className="text-xl font-semibold tracking-tight">{incident.title}</h1>
 <p className="mt-1.5 truncate font-mono text-xs text-[var(--color-muted)]">
 {incident.service} <span className="opacity-40">·</span> {incident.fingerprint}
 </p>

 <Frame className="mt-5" innerClassName="px-6 py-5">
 <PipelineBar status={incident.status} />
 </Frame>

 {awaiting && (
 <div className="relative mt-5">
 <div
 className="p-6"
 style={{
 border: "1px solid color-mix(in srgb, var(--color-accent) 40%, var(--color-line))",
 background: "color-mix(in srgb, var(--color-accent) 7%, var(--color-panel))",
 }}
 >
 <Label>action required</Label>
 <p className="mt-2 font-semibold">A fix is ready and passed verification.</p>
 <p className="mt-1 text-sm text-[var(--color-muted)]">
 Approving means &ldquo;I consent to ship this.&rdquo; The safety came from the checks
 below, not from reading the diff.
 </p>
 <div className="mt-3 flex flex-wrap items-center gap-2">
 <Chip>
 blast radius: {blast.filesChanged} file{blast.filesChanged === 1 ? "" : "s"}
 {blast.files[0] ? ` · ${blast.files[0]}` : ""}
 </Chip>
 <Chip tone={blast.smokeClean ? "var(--color-ok)" : "var(--color-warn)"}>
 {blast.smokeClean
 ? "no new errors detected"
 : `${blast.regressions} new error${blast.regressions === 1 ? "" : "s"}`}
 </Chip>
 <Chip>cost {usd(cost)}</Chip>
 <Chip tone={rev.reversible ? "var(--color-ok)" : "var(--color-warn)"}>
 {rev.reversible ? "↺ reversible" : "⚠ not fully reversible"}
 </Chip>
 </div>
 <div className="mt-4 flex gap-3">
 <Button onClick={() => decide("approve")} disabled={busy} size="lg">
 {busy ? "…" : "Approve & ship"}
 </Button>
 <Button
 variant="secondary"
 onClick={() => decide("reject")}
 disabled={busy}
 size="lg"
 >
 Reject
 </Button>
 </div>
 </div>
 <Plus at="tl" />
 <Plus at="tr" />
 <Plus at="bl" />
 <Plus at="br" />
 </div>
 )}

 {incident.status === "resolved" && deployment && !deployment.rolled_back && (
 <Frame className="mt-5" innerClassName="p-6">
 <p className="font-semibold text-[var(--color-ok)]">Shipped to production.</p>
 <p className="mt-1 text-sm text-[var(--color-muted)]">
 Changed your mind? Reverting re-points production to the previous deployment instantly,
 with no rebuild.
 </p>
 <Button
 variant="secondary"
 onClick={() => revert()}
 disabled={busy}
 size="lg"
 className="mt-4 text-[var(--color-warn)]"
 >
 {busy ? "…" : "↺ Revert (one tap)"}
 </Button>
 </Frame>
 )}

 {arts.length > 0 && (
 <Grid className="mt-5">
 {arts.map((a, i) => (
 <Cell
 key={a.key}
 icon={<Icon name={a.icon} />}
 title={a.title}
 aside={a.aside}
 span2={arts.length % 2 === 1 && i === arts.length - 1}
 >
 {a.body}
 </Cell>
 ))}
 </Grid>
 )}

 <div className="mb-2.5 mt-7 flex items-center gap-2">
 <Label>audit trail</Label>
 <span className="font-mono text-[10px] text-[var(--color-muted)]">[{events.length}]</span>
 </div>
 <Frame innerClassName="py-3">
 <AuditTable events={events} />
 </Frame>
 </div>
 </div>
 );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
 return (
 <div style={{ color: ok ? "var(--color-ok)" : "var(--color-bad)" }}>
 {ok ? "✓" : "✗"} {label}
 </div>
 );
}

function MemOutcome({ status }: { status: string }) {
 const map: Record<string, { label: string; color: string }> = {
 resolved: { label: "fix held", color: "var(--color-ok)" },
 rolled_back: { label: "was reverted", color: "var(--color-warn)" },
 escalated: { label: "escalated", color: "var(--color-escalate)" },
 };
 const m = map[status] ?? { label: status.replace(/_/g, " "), color: "var(--color-muted)" };
 return <span style={{ color: m.color }}>{m.label}</span>;
}
