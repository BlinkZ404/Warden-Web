"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { IncidentRow } from "@/lib/view";
import type { Metrics, FleetMetrics, AgentAccuracy } from "@/lib/repo/metrics";
import { StatusBadge } from "@/app/_components/ui";
import { relativeTime } from "@/lib/ui";

interface Bug {
  key: string;
  title: string;
}

export default function Dashboard() {
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [firing, setFiring] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [incRes, metRes] = await Promise.all([
      fetch("/api/incidents", { cache: "no-store" }),
      fetch("/api/metrics", { cache: "no-store" }),
    ]);
    setIncidents((await incRes.json()).incidents ?? []);
    setMetrics((await metRes.json()).metrics ?? null);
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

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-accent)]">
            Warden
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Incidents</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            The on-call engineer you don&apos;t have — every decision recorded in Aurora.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-xs text-[var(--color-muted)]">Trigger a demo incident</span>
          <div className="flex flex-wrap justify-end gap-2">
            {bugs.map((b) => (
              <button
                key={b.key}
                onClick={() => fire(b.key)}
                disabled={!!firing}
                className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-1.5 text-xs transition hover:border-[var(--color-accent)] disabled:opacity-50"
                title={b.title}
              >
                {firing === b.key ? "firing…" : b.key}
              </button>
            ))}
          </div>
        </div>
      </header>

      {metrics && <FleetPanel fleet={metrics.fleet} />}
      {metrics && <ScorecardStrip agents={metrics.agents} />}

      <div className="mt-8 overflow-hidden rounded-xl border border-[var(--color-line)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-panel)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Incident</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Review</th>
              <th className="px-4 py-3 font-medium">Tests</th>
              <th className="px-4 py-3 font-medium">Memory</th>
              <th className="px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {incidents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[var(--color-muted)]">
                  No incidents yet. Trigger a demo incident above.
                </td>
              </tr>
            )}
            {incidents.map((i) => (
              <tr
                key={i.id}
                className="border-t border-[var(--color-line)] transition hover:bg-[var(--color-panel)]"
              >
                <td className="px-4 py-3">
                  <Link href={`/dashboard/${i.id}`} className="block">
                    <div className="font-medium text-[var(--color-text)]">{i.title}</div>
                    <div className="text-xs text-[var(--color-muted)]">{i.service}</div>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={i.status} />
                </td>
                <td className="px-4 py-3">
                  {i.reviews_total === 0 ? (
                    <span className="text-[var(--color-muted)]">—</span>
                  ) : (
                    <span
                      title="reviewers that approved / panel size"
                      style={{
                        color:
                          i.reviews_approved === i.reviews_total
                            ? "var(--color-ok)"
                            : "var(--color-warn)",
                      }}
                    >
                      {i.reviews_approved}/{i.reviews_total} ✓
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {i.test_passed === null ? (
                    <span className="text-[var(--color-muted)]">—</span>
                  ) : i.test_passed ? (
                    <span className="text-[var(--color-ok)]">✓ pass</span>
                  ) : (
                    <span className="text-[var(--color-bad)]">✗ fail</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {i.seen_before ? (
                    <span className="text-[var(--color-escalate)]" title="Recognized via pgvector">
                      seen before
                    </span>
                  ) : (
                    <span className="text-[var(--color-muted)]">new</span>
                  )}
                </td>
                <td className="px-4 py-3 text-[var(--color-muted)]">{relativeTime(i.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)}%`);
const dur = (s: number | null) =>
  s == null ? "—" : s < 90 ? `${Math.round(s)}s` : `${Math.round(s / 60)}m`;

/**
 * Fleet / PMF rates (BUSINESS-PLAN §10). Accuracy is the deterministic gate +
 * production health, never an agent rating itself — the revert rate is the
 * kill-switch.
 */
function FleetPanel({ fleet }: { fleet: FleetMetrics }) {
  const tiles: { label: string; value: string; hint: string; tone?: string }[] = [
    {
      label: "Autonomy",
      value: pct(fleet.autonomyRate),
      hint: `${fleet.reachedApproval} auto-handled · ${fleet.escalated} escalated`,
      tone: "var(--color-accent)",
    },
    {
      label: "Approval rate",
      value: pct(fleet.approvalRate),
      hint: `${fleet.approved} of ${fleet.reachedApproval} verified fixes shipped`,
      tone: "var(--color-ok)",
    },
    {
      label: "Revert rate",
      value: pct(fleet.revertRate),
      hint: `${fleet.reverted} of ${fleet.shipped} shipped reverted`,
      tone: fleet.revertWithinCeiling === false ? "var(--color-bad)" : "var(--color-ok)",
    },
    {
      label: "Time to verified",
      value: dur(fleet.timeToVerifiedSec),
      hint: `${fleet.resolved} resolved of ${fleet.totalIncidents} incidents`,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-3">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">{t.label}</div>
          <div className="mt-1 text-2xl font-semibold" style={t.tone ? { color: t.tone } : undefined}>
            {t.value}
          </div>
          <div className="mt-1 text-xs text-[var(--color-muted)]">{t.hint}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Per-agent accuracy. Fixers show derived rates (verified/attempts → the gate
 * pass rate, etc.); reviewers show raw counts, since the gate-pass/approval/
 * regression credits structurally land on the fixer, not the reviewer.
 */
function ScorecardStrip({ agents }: { agents: AgentAccuracy[] }) {
  if (agents.length === 0) return null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {agents.map((a) => (
        <div key={`${a.agent}-${a.role}`} className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-3">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            {a.agent} · {a.role}
          </div>
          {a.role === "fixer" ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className="text-[var(--color-ok)]">verified <b>{pct(a.verifyRate)}</b></span>
              <span className="text-[var(--color-accent)]">approved <b>{pct(a.approvalRate)}</b></span>
              <span className="text-[var(--color-bad)]">regressions <b>{pct(a.regressionRate)}</b></span>
              <span className="text-[var(--color-muted)]">{a.attempts} attempts</span>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span>reviews <b>{a.attempts}</b></span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
