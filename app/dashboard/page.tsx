"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { IncidentRow } from "@/lib/view";
import type { AgentScorecard } from "@/lib/db/types";
import { StatusBadge, VerdictPill } from "@/app/_components/ui";
import { relativeTime } from "@/lib/ui";

interface Bug {
  key: string;
  title: string;
}

export default function Dashboard() {
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [scorecards, setScorecards] = useState<AgentScorecard[]>([]);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [firing, setFiring] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/incidents", { cache: "no-store" });
    const data = await res.json();
    setIncidents(data.incidents ?? []);
    setScorecards(data.scorecards ?? []);
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
            Nightshift
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

      <ScorecardStrip scorecards={scorecards} />

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
                  <VerdictPill verdict={i.reviewer_verdict} />
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

function ScorecardStrip({ scorecards }: { scorecards: AgentScorecard[] }) {
  if (scorecards.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {scorecards.map((c) => (
        <div key={c.id} className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-3">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            {c.agent} · {c.role}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>attempts <b>{c.attempts}</b></span>
            <span className="text-[var(--color-ok)]">verified <b>{c.verified_passed}</b></span>
            <span className="text-[var(--color-accent)]">approved <b>{c.human_approved}</b></span>
            <span className="text-[var(--color-bad)]">regressions <b>{c.regressions}</b></span>
          </div>
        </div>
      ))}
    </div>
  );
}
