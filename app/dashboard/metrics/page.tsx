"use client";

import type { Metrics, FleetMetrics, AgentAccuracy } from "@/lib/repo/metrics";
import {
 Frame,
 Grid,
 Cell,
 Label,
 Plus,
 StatTiles,
 PageHeader,
 PageBody,
 Loading,
 Empty,
 ErrorState,
 Banner,
} from "@/app/_components/console";
import { Icon } from "@/app/_components/icons";
import { Brand, actorLabel } from "@/app/_components/brand";
import { usePolled } from "@/app/_components/use-polled";
import { pct, dur } from "@/lib/ui";
import {
 computeRoi,
 usd,
 BASELINE_MTTR_MIN,
 DOWNTIME_USD_PER_MIN,
 ENG_HOURLY_USD,
} from "@/lib/pricing";

export default function MetricsPage() {
 const { data: m, error, loaded, reload } = usePolled<Metrics>(
 "/api/metrics",
 (j) => (j as { metrics: Metrics }).metrics,
 4000);

 return (
 <div>
 <PageHeader
 title="metrics"
 aside={
 <span className="font-mono text-[11px] text-[var(--color-muted)]">
 from verification results
 </span>
 }
 />

 <PageBody className="space-y-6">
 {error && m && (
 <Banner tone="var(--color-warn)">Couldn&rsquo;t refresh. Showing the last update.</Banner>
 )}
 {!m ? (
 error ? (
 <ErrorState onRetry={reload} />
 ) : loaded ? (
 <Empty>No metrics yet. Resolve an incident to populate this.</Empty>
 ) : (
 <Loading />
 )
 ) : (
 <>
 <FleetTiles fleet={m.fleet} />
 <ValueDelivered fleet={m.fleet} />
 <KillSwitch fleet={m.fleet} />
 <div>
 <div className="mb-2.5 flex items-center gap-2">
 <Label>resolution funnel</Label>
 </div>
 <Funnel fleet={m.fleet} />
 </div>
 <div>
 <div className="mb-2.5 flex items-center gap-2">
 <Label>per-agent accuracy</Label>
 <span className="font-mono text-[10px] text-[var(--color-muted)]">
 [{m.agents.length}]
 </span>
 </div>
 <AgentTable agents={m.agents} />
 </div>
 </>
 )}
 </PageBody>
 </div>
 );
}

function FleetTiles({ fleet }: { fleet: FleetMetrics }) {
 return (
 <StatTiles
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
 label: "Change-failure rate",
 value: pct(fleet.revertRate),
 hint: `${fleet.reverted} of ${fleet.shipped} reverted · DORA Elite ≤15%`,
 tone: fleet.revertWithinCeiling === false ? "var(--color-bad)" : "var(--color-ok)",
 },
 {
 label: "Time to verified",
 value: dur(fleet.timeToVerifiedSec),
 hint: `MTTR ${dur(fleet.mttrSec)} · ${fleet.resolved}/${fleet.totalIncidents} resolved`,
 },
 ]}
 />
 );
}

/** Dollarized ROI: downtime avoided + engineer-hours reclaimed, vs Warden's fee. */
function ValueDelivered({ fleet }: { fleet: FleetMetrics }) {
 const roi = computeRoi(fleet.resolved, fleet.timeToVerifiedSec);
 return (
 <div>
 <div className="mb-2.5">
 <Label>value delivered</Label>
 </div>
 <StatTiles
 tiles={[
 {
 label: "Value delivered",
 value: usd(roi.valueDeliveredUsd),
 hint: "downtime avoided + hours saved",
 tone: "var(--color-ok)",
 },
 {
 label: "Downtime avoided",
 value: usd(roi.downtimeAvoidedUsd),
 hint: `${fleet.resolved} fixes shipped before impact`,
 },
 {
 label: "Hours reclaimed",
 value: `${roi.hoursReclaimed.toFixed(1)}h`,
 hint: `${usd(roi.laborSavedUsd)} of on-call labor`,
 },
 {
 label: "MTTR",
 value: dur(fleet.mttrSec),
 hint: "detected → closed",
 },
 ]}
 />
 <p className="mt-2 font-mono text-[10px] text-[var(--color-muted)]">
 Modelled: {BASELINE_MTTR_MIN}m baseline manual MTTR · {usd(DOWNTIME_USD_PER_MIN)}/downtime-min
 · {usd(ENG_HOURLY_USD)}/eng-hr. Assumptions, not a metered bill.
 </p>
 </div>
 );
}

/** The §10 kill-switch: post-ship revert rate against its ceiling. */
function KillSwitch({ fleet }: { fleet: FleetMetrics }) {
 const within = fleet.revertWithinCeiling;
 const color =
 within === false ? "var(--color-bad)" : within === true ? "var(--color-ok)" : "var(--color-muted)";
 const headline =
 within === false
 ? "Revert rate above ceiling. Stop expanding fix scope."
 : within === true
 ? "Revert rate within ceiling. Safe to keep shipping."
 : "Nothing shipped yet. Kill-switch idle.";
 return (
 <div className="relative">
 <div
 className="flex flex-wrap items-center justify-between gap-4 p-5"
 style={{
 border: `1px solid color-mix(in srgb, ${color} 35%, var(--color-line))`,
 background: `color-mix(in srgb, ${color} 7%, var(--color-panel))`,
 }}
 >
 <div className="flex items-center gap-3">
 <span style={{ color }}>
 <Icon name="shieldCheck" size={20} />
 </span>
 <div>
 <div className="text-sm font-semibold" style={{ color }}>
 {headline}
 </div>
 <div className="mt-0.5 font-mono text-[11px] text-[var(--color-muted)]">
 kill-switch ceiling {Math.round(fleet.revertCeiling * 100)}% · current {pct(fleet.revertRate)}
 </div>
 </div>
 </div>
 <div className="font-mono text-2xl font-semibold" style={{ color }}>
 {pct(fleet.revertRate)}
 </div>
 </div>
 <Plus at="tl" />
 <Plus at="tr" />
 <Plus at="bl" />
 <Plus at="br" />
 </div>
 );
}

function Funnel({ fleet }: { fleet: FleetMetrics }) {
 const max = Math.max(fleet.totalIncidents, 1);
 const rows: { label: string; n: number; tone: string }[] = [
 { label: "Detected", n: fleet.totalIncidents, tone: "var(--color-brand-2)" },
 { label: "Reached approval", n: fleet.reachedApproval, tone: "var(--color-accent)" },
 { label: "Approved", n: fleet.approved, tone: "var(--color-ok)" },
 { label: "Shipped", n: fleet.shipped, tone: "var(--color-ok)" },
 { label: "Reverted", n: fleet.reverted, tone: "var(--color-warn)" },
 { label: "Escalated", n: fleet.escalated, tone: "var(--color-escalate)" },
 ];
 return (
 <Frame innerClassName="px-5 py-4">
 <div className="space-y-2.5">
 {rows.map((r) => (
 <div key={r.label} className="flex items-center gap-3">
 <span className="w-32 shrink-0 font-mono text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
 {r.label}
 </span>
 <div className="h-3 flex-1 overflow-hidden rounded-sm bg-[var(--color-panel-2)]">
 <div
 className="h-full rounded-sm transition-all"
 style={{ width: `${(r.n / max) * 100}%`, background: r.tone, minWidth: r.n ? 4 : 0 }}
 />
 </div>
 <span className="w-8 shrink-0 text-right font-mono text-xs text-[var(--color-text)]">
 {r.n}
 </span>
 </div>
 ))}
 </div>
 </Frame>
 );
}

function AgentTable({ agents }: { agents: AgentAccuracy[] }) {
 if (agents.length === 0)
 return (
 <Frame innerClassName="px-5 py-8">
 <p className="text-center font-mono text-xs text-[var(--color-muted)]">
 no agent activity recorded yet
 </p>
 </Frame>
 );
 return (
 <Grid cols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
 {agents.map((a) => (
 <Cell
 key={`${a.agent}-${a.role}`}
 icon={<Brand actor={a.agent} size={16} />}
 title={actorLabel(a.agent)}
 aside={a.role}
 >
 {a.role === "fixer" ? (
 <div className="space-y-2">
 <Stat label="verified" value={pct(a.verifyRate)} tone="var(--color-ok)" sub={`${a.verified_passed}/${a.attempts}`} />
 <Stat label="approved" value={pct(a.approvalRate)} tone="var(--color-brand-2)" sub={`${a.human_approved}/${a.verified_passed}`} />
 <Stat label="regressed" value={pct(a.regressionRate)} tone="var(--color-bad)" sub={`${a.regressions}/${a.human_approved}`} />
 </div>
 ) : (
 <div className="font-mono text-xs text-[var(--color-muted)]">
 reviews <b className="text-[var(--color-text)]">{a.attempts}</b>
 </div>
 )}
 </Cell>
 ))}
 </Grid>
 );
}

function Stat({
 label,
 value,
 tone,
 sub,
}: {
 label: string;
 value: string;
 tone: string;
 sub: string;
}) {
 return (
 <div className="flex items-baseline justify-between gap-3 font-mono text-xs">
 <span className="uppercase tracking-wider text-[var(--color-muted)]">{label}</span>
 <span className="flex items-baseline gap-2">
 <span className="text-[10px] text-[var(--color-muted)]">{sub}</span>
 <b style={{ color: tone }}>{value}</b>
 </span>
 </div>
 );
}
