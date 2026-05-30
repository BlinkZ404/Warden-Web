"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { IncidentBundle } from "@/lib/view";
import { StatusBadge, PipelineBar, VerdictPill } from "@/app/_components/ui";
import { relativeTime } from "@/lib/ui";

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const [bundle, setBundle] = useState<IncidentBundle | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/incidents/${id}`, { cache: "no-store" });
    if (res.ok) setBundle(await res.json());
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

  if (!bundle) return <main className="p-10 text-[var(--color-muted)]">Loading…</main>;

  const { incident, investigation, fixAttempt, reviews, verification, deployment, outcome, events } =
    bundle;
  const approvals = reviews.filter((r) => r.verdict === "approve").length;
  const awaiting = incident.status === "awaiting_approval";

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/dashboard" className="text-sm text-[var(--color-accent)]">
        ← all incidents
      </Link>

      <header className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{incident.title}</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {incident.service} · <code className="text-xs">{incident.fingerprint}</code>
          </p>
        </div>
        <StatusBadge status={incident.status} />
      </header>

      <div className="mt-6 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5">
        <PipelineBar status={incident.status} />
      </div>

      {awaiting && (
        <div className="mt-6 rounded-xl border border-[var(--color-warn)] bg-[color-mix(in_srgb,var(--color-warn)_8%,transparent)] p-5">
          <p className="font-medium">A fix is ready and passed verification.</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Approving means &ldquo;I consent to ship this.&rdquo; The safety came from the checks
            below, not from reading the diff.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => decide("approve")}
              disabled={busy}
              className="rounded-lg bg-[var(--color-ok)] px-5 py-2 font-medium text-black disabled:opacity-50"
            >
              {busy ? "…" : "Approve & ship"}
            </button>
            <button
              onClick={() => decide("reject")}
              disabled={busy}
              className="rounded-lg border border-[var(--color-line)] px-5 py-2 font-medium disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {incident.status === "resolved" && deployment && !deployment.rolled_back && (
        <div className="mt-6 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5">
          <p className="font-medium text-[var(--color-ok)]">Shipped to production.</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Changed your mind? Reverting re-points production to the previous deployment
            instantly — no rebuild.
          </p>
          <button
            onClick={() => revert()}
            disabled={busy}
            className="mt-4 rounded-lg border border-[var(--color-line)] px-5 py-2 font-medium text-[var(--color-warn)] disabled:opacity-50"
          >
            {busy ? "…" : "⤺ Revert (one tap)"}
          </button>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {investigation && (
          <Card title="Investigation" who="Claude">
            <p className="text-sm">{investigation.root_cause}</p>
            <Meta label="confidence" value={`${Math.round((investigation.confidence ?? 0) * 100)}%`} />
          </Card>
        )}
        {fixAttempt && (
          <Card title="Fix proposed" who={fixAttempt.agent}>
            <p className="text-sm">{fixAttempt.diff_summary}</p>
            <Meta label="branch" value={fixAttempt.branch ?? "—"} />
            <Meta
              label="files"
              value={(fixAttempt.files_changed as string[] | null)?.join(", ") ?? "—"}
            />
          </Card>
        )}
        {reviews.length > 0 && (
          <Card title={`Reviewer panel (${reviews.length})`} who={`${approvals}/${reviews.length} approved`}>
            <div className="space-y-3">
              {reviews.map((r) => (
                <div key={r.id} className="border-t border-[var(--color-line)] pt-2 first:border-0 first:pt-0">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs text-[var(--color-muted)]">{r.reviewer_agent}</span>
                    <VerdictPill verdict={r.verdict} />
                  </div>
                  <ul className="mt-1 list-disc pl-4 text-xs text-[var(--color-muted)]">
                    {((r.findings as { notes?: string[] })?.notes ?? []).map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        )}
        {verification && (
          <Card title="Verification gate" who="deterministic">
            <Check ok={!!verification.test_passed} label="tests pass" />
            <Check ok={!verification.error_recurred} label="original error stopped" />
            <Check
              ok={!((verification.new_errors as unknown[] | null)?.length)}
              label="no new errors detected"
            />
            {verification.preview_url && (
              <Meta label="preview" value={verification.preview_url} />
            )}
          </Card>
        )}
        {deployment && (
          <Card title="Deployment" who="Vercel">
            {deployment.prod_url && <Meta label="prod" value={deployment.prod_url} />}
            <Meta label="preview" value={deployment.preview_url ?? "—"} />
            {deployment.rolled_back && (
              <p className="mt-1 text-sm text-[var(--color-warn)]">⤺ auto-rolled back</p>
            )}
          </Card>
        )}
        {outcome && (
          <Card title="Outcome" who="">
            <Meta label="resolved" value={String(outcome.resolved)} />
            <Meta label="type" value={outcome.resolution_type ?? "—"} />
            <p className="mt-1 text-xs text-[var(--color-muted)]">{outcome.notes}</p>
          </Card>
        )}
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Audit trail ({events.length})
        </h2>
        <ol className="space-y-1">
          {events.map((e) => (
            <li
              key={e.id}
              className="flex items-start gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-xs"
            >
              <span className="w-28 shrink-0 font-mono text-[var(--color-muted)]">{e.type}</span>
              <span className="w-24 shrink-0 text-[var(--color-accent)]">{e.actor}</span>
              <code className="flex-1 break-all text-[var(--color-muted)]">
                {summarize(e.payload)}
              </code>
              <span className="shrink-0 text-[var(--color-muted)]">{relativeTime(e.created_at)}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function Card({ title, who, children }: { title: string; who: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {who && <span className="text-xs text-[var(--color-muted)]">{who}</span>}
      </div>
      {children}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-1 text-xs">
      <span className="text-[var(--color-muted)]">{label}: </span>
      <span className="break-all">{value}</span>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="text-sm" style={{ color: ok ? "var(--color-ok)" : "var(--color-bad)" }}>
      {ok ? "✓" : "✗"} {label}
    </div>
  );
}

function summarize(payload: Record<string, unknown>): string {
  const s = JSON.stringify(payload);
  return s.length > 160 ? s.slice(0, 157) + "…" : s;
}
