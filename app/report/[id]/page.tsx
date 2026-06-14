"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { IncidentBundle } from "@/lib/view";
import { StatusBadge, VerdictPill } from "@/app/_components/ui";
import { Frame, Grid, Cell, Field, Label, StatTiles, Loading, Empty } from "@/app/_components/console";
import { Brand } from "@/app/_components/brand";
import { Icon } from "@/app/_components/icons";
import { ReproTheater } from "@/app/_components/repro-theater";
import { reproPair, fixCostUsd, blastRadius } from "@/lib/incident-derive";
import { usd } from "@/lib/pricing";
import { humanizeType, eventSummary } from "@/lib/audit";
import { relativeTime, dur } from "@/lib/ui";

export default function ReportPage() {
 const { id } = useParams<{ id: string }>();
 const [b, setB] = useState<IncidentBundle | null>(null);
 const [loaded, setLoaded] = useState(false);

 useEffect(() => {
 fetch(`/api/incidents/${id}`, { cache: "no-store" })
 .then((r) => (r.ok ? r.json() : null))
 .then((d) => setB(d))
 .catch(() => {})
 .finally(() => setLoaded(true));
 }, [id]);

 if (!b) {
 return (
 <div className="grid min-h-screen place-items-center">
 {loaded ? <Empty>Report not found.</Empty> : <Loading />}
 </div>
 );
 }

 const { incident, investigation, fixAttempt, reviews, verification, deployment, outcome, events } =
 b;
 const pair = reproPair(events);
 const cost = fixCostUsd(events);
 const blast = blastRadius(fixAttempt, verification);
 const approvals = reviews.filter((r) => r.verdict === "approve").length;

 const t0 = events.length ? new Date(events[0].created_at).getTime() : 0;
 const tEnd = outcome?.closed_at
 ? new Date(outcome.closed_at).getTime()
 : events.length
 ? new Date(events[events.length - 1].created_at).getTime()
 : 0;
 const shipSec = t0 && tEnd ? Math.max(0, (tEnd - t0) / 1000) : null;

 return (
 <div className="mx-auto max-w-3xl px-6 py-10">
 <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-4">
 <Link href="/" className="flex items-center gap-2.5">
 <span className="grid h-6 w-6 place-items-center rounded-md border border-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-line))] text-[var(--color-brand-2)]">
 <Icon name="shield" size={13} />
 </span>
 <span className="text-sm font-semibold tracking-[0.16em]">WARDEN</span>
 <span className="font-mono text-[11px] text-[var(--color-muted)]">incident fix report</span>
 </Link>
 <StatusBadge status={incident.status} />
 </div>

 <h1 className="mt-6 text-2xl font-semibold tracking-tight">{incident.title}</h1>
 <p className="mt-1.5 font-mono text-xs text-[var(--color-muted)]">
 {incident.service} <span className="opacity-40">·</span> {incident.fingerprint}
 </p>
 <p className="mt-4 text-sm leading-relaxed text-[var(--color-muted)]">
 Warden detected the error, investigated it, wrote a fix on a branch, ran an independent
 multi-model review, then <span className="text-[var(--color-text)]">verified the fix</span> on
 a preview before you approved the ship. Here is the proof.
 </p>

 <div className="mt-6">
 <StatTiles
 tiles={[
 { label: "Detect → ship", value: dur(shipSec), hint: "end to end", tone: "var(--color-brand-2)" },
 {
 label: "Reviewers",
 value: reviews.length ? `${approvals}/${reviews.length}` : "—",
 hint: "approved",
 tone: "var(--color-ok)",
 },
 { label: "Blast radius", value: `${blast.filesChanged} file${blast.filesChanged === 1 ? "" : "s"}`, hint: blast.smokeClean ? "smoke clean" : `${blast.regressions} new` },
 { label: "Cost", value: usd(cost), hint: "this fix" },
 ]}
 />
 </div>

 {investigation?.root_cause && (
 <Frame className="mt-6" innerClassName="p-5">
 <Label>what broke</Label>
 <p className="mt-2 text-sm leading-relaxed">{investigation.root_cause}</p>
 </Frame>
 )}

 <div className="mt-6">
 <Label>the proof</Label>
 <Frame className="mt-2.5" innerClassName="p-5">
 <div className="space-y-1.5 font-mono text-sm">
 <Proof ok={!!verification?.test_passed} label="tests pass" />
 <Proof ok={!verification?.error_recurred} label="original error stopped" />
 <Proof ok={blast.smokeClean} label="no new errors detected" />
 </div>
 <ReproTheater pair={pair} />
 </Frame>
 </div>

 {reviews.length > 0 && (
 <div className="mt-6">
 <Label>independent review</Label>
 <Grid className="mt-2.5" cols="grid-cols-1 sm:grid-cols-2">
 {reviews.map((r) => (
 <Cell key={r.id} icon={<Brand actor={r.reviewer_agent} />} title={r.reviewer_agent}>
 <div className="flex items-center justify-between">
 <span className="font-mono text-[11px] text-[var(--color-muted)]">verdict</span>
 <VerdictPill verdict={r.verdict} />
 </div>
 <ul className="mt-2 space-y-1 text-xs text-[var(--color-muted)]">
 {((r.findings as { notes?: string[] })?.notes ?? []).slice(0, 3).map((n, i) => (
 <li key={i} className="flex gap-1.5">
 <span className="text-[var(--color-brand-2)]">→</span>
 <span>{n}</span>
 </li>
 ))}
 </ul>
 </Cell>
 ))}
 </Grid>
 </div>
 )}

 {(deployment?.prod_url || fixAttempt?.branch) && (
 <Frame className="mt-6" innerClassName="p-5">
 <Label>shipped</Label>
 <div className="mt-2">
 {fixAttempt?.branch && <Field label="branch" value={fixAttempt.branch} accent />}
 {deployment?.prod_url && <Field label="prod" value={deployment.prod_url} accent />}
 {deployment?.rolled_back && (
 <p className="mt-1 font-mono text-xs text-[var(--color-warn)]">↺ later reverted</p>
 )}
 </div>
 </Frame>
 )}

 <div className="mt-6">
 <Label>timeline</Label>
 <Frame className="mt-2.5" innerClassName="px-5 py-3">
 <div className="font-mono text-[11px] leading-relaxed">
 {events.map((e) => (
 <div
 key={e.id}
 className="flex gap-4 border-t border-[var(--color-line)] py-1.5 first:border-0 first:pt-0"
 >
 <span className="w-20 shrink-0 text-[var(--color-muted)]">
 {relativeTime(e.created_at)}
 </span>
 <span className="w-28 shrink-0 text-[var(--color-brand-2)]">
 {humanizeType(e.type)}
 </span>
 <span className="min-w-0 flex-1 break-words text-[var(--color-muted)]">
 {eventSummary(e.type, e.payload)}
 </span>
 </div>
 ))}
 </div>
 </Frame>
 </div>

 <div className="mt-8 flex items-center justify-between border-t border-[var(--color-line)] pt-4 font-mono text-[11px] text-[var(--color-muted)]">
 <span>Verified by Warden · checks and tests, not an AI rating its own work.</span>
 <Link href="/dashboard" className="text-[var(--color-brand-2)] hover:underline">
 warden →
 </Link>
 </div>
 </div>
 );
}

function Proof({ ok, label }: { ok: boolean; label: string }) {
 return (
 <div style={{ color: ok ? "var(--color-ok)" : "var(--color-bad)" }}>
 {ok ? "✓" : "✗"} {label}
 </div>
 );
}
