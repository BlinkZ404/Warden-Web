"use client";

import { useEffect, useState, useCallback } from "react";
import type { IncidentRow } from "@/lib/view";
import type { Metrics, FleetMetrics, AgentAccuracy } from "@/lib/repo/metrics";
import {
 Frame,
 Plus,
 Label,
 StatTiles,
 PageHeader,
 PageBody,
 Button,
} from "@/app/_components/console";
import { IncidentsTable } from "@/app/_components/incidents-table";
import { actorLabel } from "@/app/_components/brand";
import { pct, dur } from "@/lib/ui";

interface Bug {
 key: string;
 title: string;
}

export default function Dashboard() {
 const [incidents, setIncidents] = useState<IncidentRow[]>([]);
 const [metrics, setMetrics] = useState<Metrics | null>(null);
 const [bugs, setBugs] = useState<Bug[]>([]);
 const [firing, setFiring] = useState<string | null>(null);
 const [loaded, setLoaded] = useState(false);
 const [clearing, setClearing] = useState(false);

 const load = useCallback(async () => {
 try {
 const [incRes, metRes] = await Promise.all([
 fetch("/api/incidents", { cache: "no-store" }),
 fetch("/api/metrics", { cache: "no-store" }),
 ]);
 if (incRes.ok) setIncidents((await incRes.json()).incidents ?? []);
 if (metRes.ok) setMetrics((await metRes.json()).metrics ?? null);
 } catch {
 // A transient fetch or parse failure should not tear down the dashboard;
 // the current data stays on screen and the next poll recovers.
 } finally {
 setLoaded(true);
 }
 }, []);

 useEffect(() => {
 load();
 fetch("/api/sim/fire")
 .then((r) => r.json())
 .then((d) => setBugs(d.bugs ?? []));
 const t = setInterval(load, 3000);
 return () => clearInterval(t);
 }, [load]);

 async function fire(bugKey: string) {
 setFiring(bugKey);
 try {
 await fetch("/api/sim/fire", {
 method: "POST",
 headers: { "content-type": "application/json" },
 body: JSON.stringify({ bugKey }),
 });
 await load();
 } finally {
 setFiring(null);
 }
 }

 async function clear() {
 if (!window.confirm("Clear all incidents? This wipes the simulated incidents, audit trail, and scorecard. Your keys, wallet, and settings are kept.")) return;
 setClearing(true);
 try {
 await fetch("/api/sim/reset", { method: "POST" });
 await load();
 } finally {
 setClearing(false);
 }
 }

 return (
 <div>
 <PageHeader
 title="incidents"
 aside={<SimulateMenu bugs={bugs} firing={firing} onFire={fire} onClear={clear} clearing={clearing} />}
 />

 <PageBody>
 {loaded && incidents.length === 0 && <FirstRun bugs={bugs} firing={firing} onFire={fire} />}
 {metrics && <FleetPanel fleet={metrics.fleet} />}
 {metrics && <ScorecardStrip agents={metrics.agents} />}

 <div className="mb-2.5 mt-7 flex items-center gap-2">
 <Label>incidents</Label>
 <span className="font-mono text-[10px] text-[var(--color-muted)]">[{incidents.length}]</span>
 </div>
 <Frame>
 <IncidentsTable incidents={incidents} />
 </Frame>
 </PageBody>
 </div>
 );
}

/** Header control to fire a sample incident: a dropdown of the seeded sandbox
 * bugs, collapsed so it doesn't crowd the bar as the catalog grows. */
function SimulateMenu({
 bugs,
 firing,
 onFire,
 onClear,
 clearing,
}: {
 bugs: Bug[];
 firing: string | null;
 onFire: (key: string) => void;
 onClear: () => void;
 clearing: boolean;
}) {
 const [open, setOpen] = useState(false);
 return (
 <div className="relative">
 <Button
 variant="secondary"
 size="sm"
 onClick={() => setOpen((o) => !o)}
 disabled={bugs.length === 0}
 >
 <Label className="text-[var(--color-muted)]">simulate</Label>
 {firing ? (
 <span className="font-mono text-[11px]">firing…</span>
 ) : (
 <span aria-hidden className="text-[10px]">
 ▾
 </span>
 )}
 </Button>
 {open && (
 <>
 <button
 aria-hidden
 tabIndex={-1}
 onClick={() => setOpen(false)}
 className="fixed inset-0 z-20 cursor-default"
 />
 <div className="absolute right-0 z-30 mt-1.5 w-72 overflow-hidden rounded-md border border-[var(--color-line)] bg-[var(--color-panel)] shadow-lg">
 <div className="border-b border-[var(--color-line)] px-3 py-2">
 <Label>fire a sample incident</Label>
 </div>
 <div className="max-h-80 overflow-y-auto py-1">
 {bugs.map((b) => (
 <button
 key={b.key}
 onClick={() => {
 onFire(b.key);
 setOpen(false);
 }}
 disabled={!!firing}
 className="block w-full cursor-pointer px-3 py-2 text-left transition hover:bg-[var(--color-panel-2)] disabled:cursor-not-allowed disabled:opacity-50"
 >
 <div className="font-mono text-xs text-[var(--color-text)]">{b.key}</div>
 <div className="truncate text-[11px] text-[var(--color-muted)]">{b.title}</div>
 </button>
 ))}
 </div>
 <div className="border-t border-[var(--color-line)] p-1">
 <button
 onClick={() => {
 onClear();
 setOpen(false);
 }}
 disabled={clearing}
 className="block w-full cursor-pointer rounded px-3 py-2 text-left text-[11px] text-[var(--color-bad)] transition hover:bg-[var(--color-panel-2)] disabled:cursor-not-allowed disabled:opacity-50"
 >
 {clearing ? "clearing…" : "Clear all incidents"}
 </button>
 </div>
 </div>
 </>
 )}
 </div>
 );
}

/** Zero-config first incident: narrate the trust ladder and fire a real sandbox bug. */
function FirstRun({
 bugs,
 firing,
 onFire,
}: {
 bugs: Bug[];
 firing: string | null;
 onFire: (key: string) => void;
}) {
 const pick = bugs.find((b) => b.key === "checkout-missing-price") ?? bugs[0];
 const ladder = [
 "Fixes run on a branch in a sandbox, not your live code",
 "Shows readable proof, not a diff to read",
 "An independent multi-model panel cross-checks it",
 "Nothing ships without your one tap; revert in one click",
 ];
 return (
 <div className="relative mb-7">
 <Frame innerClassName="p-7">
 <Label>first run</Label>
 <h2 className="mt-2 text-xl font-semibold tracking-tight">Watch Warden fix a bug</h2>
 <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[var(--color-muted)]">
 No setup needed. Warden fires a real error into a sandbox app, then investigates, writes a
 fix, runs verification checks, and waits for your approval to ship.
 </p>
 <div className="mt-4 grid gap-2 sm:grid-cols-2">
 {ladder.map((l) => (
 <div key={l} className="flex items-start gap-2 text-xs text-[var(--color-muted)]">
 <span className="mt-0.5 text-[var(--color-ok)]">✓</span>
 <span>{l}</span>
 </div>
 ))}
 </div>
 <Button
 onClick={() => pick && onFire(pick.key)}
 disabled={!pick || !!firing}
 size="lg"
 className="mt-5"
 >
 {firing ? "running…" : "▶ Run a sample incident"}
 </Button>
 </Frame>
 </div>
 );
}

/**
 * Fleet rates. Accuracy comes from verification results and production health,
 * not from agents rating themselves; the revert rate is the kill-switch.
 */
function FleetPanel({ fleet }: { fleet: FleetMetrics }) {
 return (
 <StatTiles
 size="sm"
 tiles={[
 {
 label: "Autonomy",
 value: pct(fleet.autonomyRate),
 hint: `${fleet.reachedApproval} auto-handled · ${fleet.escalated} escalated`,
 tone: "var(--color-brand-2)",
 },
 {
 label: "Approval rate",
 value: pct(fleet.approvalRate),
 hint: `${fleet.approved} of ${fleet.reachedApproval} shipped`,
 tone: "var(--color-ok)",
 },
 {
 label: "Revert rate",
 value: pct(fleet.revertRate),
 hint: `${fleet.reverted} of ${fleet.shipped} reverted`,
 tone: fleet.revertWithinCeiling === false ? "var(--color-bad)" : "var(--color-ok)",
 },
 {
 label: "Time to verified",
 value: dur(fleet.timeToVerifiedSec),
 hint: `${fleet.resolved} of ${fleet.totalIncidents} resolved`,
 },
 ]}
 />
 );
}

/**
 * Per-agent accuracy. Fixers show derived rates; reviewers show raw counts,
 * since the gate-pass / approval / regression credits land on the fixer.
 */
function ScorecardStrip({ agents }: { agents: AgentAccuracy[] }) {
 if (agents.length === 0) return null;
 return (
 <div className="relative mt-4">
 <div className="grid grid-cols-2 gap-px border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-4">
 {agents.map((a) => (
 <div key={`${a.agent}-${a.role}`} className="bg-[var(--color-panel)] p-4">
 <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
 {actorLabel(a.agent)} <span className="opacity-40">·</span> {a.role}
 </div>
 {a.role === "fixer" ? (
 <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
 <span className="text-[var(--color-ok)]">
 verified <b>{pct(a.verifyRate)}</b>
 </span>
 <span className="text-[var(--color-brand-2)]">
 approved <b>{pct(a.approvalRate)}</b>
 </span>
 <span className="text-[var(--color-bad)]">
 regress <b>{pct(a.regressionRate)}</b>
 </span>
 </div>
 ) : (
 <div className="mt-2 font-mono text-xs text-[var(--color-muted)]">
 reviews <b className="text-[var(--color-text)]">{a.attempts}</b>
 </div>
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
