"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import type { IncidentBundle } from "@/lib/view";
import { statusMeta } from "@/lib/ui";
import { EnableNotifications } from "@/app/_components/push";

/**
 * Mobile-first approval screen (PLAN §8, §14). The founder can't vet code, so
 * the trust comes from the verification results shown here + cheap
 * reversibility — not from reading a diff.
 */
export default function Approve() {
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
        body: JSON.stringify({ decision, decidedBy: "founder", channel: "push" }),
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

  if (!bundle) return <main className="p-8 text-center text-[var(--color-muted)]">Loading…</main>;

  const { incident, fixAttempt, verification, deployment } = bundle;
  const awaiting = incident.status === "awaiting_approval";
  const meta = statusMeta(incident.status);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-5 py-8">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-accent)]">
          Nightshift
        </p>
        <EnableNotifications />
      </div>

      <div>
        <h1 className="text-2xl font-semibold leading-snug">
          Found a fix for the {incident.service} crash
        </h1>
        <p className="mt-2 text-[var(--color-muted)]">{incident.title}</p>
      </div>

      {fixAttempt?.diff_summary && (
        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5">
          <p className="text-sm leading-relaxed">{fixAttempt.diff_summary}</p>
        </div>
      )}

      {verification && (
        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
            Tested on a preview
          </p>
          <Row ok={!!verification.test_passed} label="All tests pass" />
          <Row ok={!verification.error_recurred} label="The error is gone" />
          <Row ok={!((verification.new_errors as unknown[] | null)?.length)} label="No new errors detected" />
        </div>
      )}

      {awaiting ? (
        <div className="mt-auto flex flex-col gap-3">
          <button
            onClick={() => decide("approve")}
            disabled={busy}
            className="rounded-2xl bg-[var(--color-ok)] py-4 text-lg font-semibold text-black active:scale-[0.99] disabled:opacity-50"
          >
            {busy ? "Shipping…" : "Approve & ship"}
          </button>
          <button
            onClick={() => decide("reject")}
            disabled={busy}
            className="rounded-2xl border border-[var(--color-line)] py-3 font-medium text-[var(--color-muted)] disabled:opacity-50"
          >
            Not now
          </button>
          <p className="text-center text-xs text-[var(--color-muted)]">
            One tap ships it. One tap rolls it back. You stay in control.
          </p>
        </div>
      ) : (
        <div className="mt-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5 text-center">
          <p className="text-lg font-medium" style={{ color: meta.color }}>
            {meta.label}
          </p>
          {incident.status === "resolved" && deployment?.prod_url && (
            <p className="mt-1 text-sm text-[var(--color-muted)]">Live at {deployment.prod_url}</p>
          )}
          {incident.status === "resolved" && !deployment?.rolled_back && (
            <button
              onClick={() => revert()}
              disabled={busy}
              className="mt-4 w-full rounded-2xl border border-[var(--color-line)] py-3 font-medium text-[var(--color-warn)] disabled:opacity-50"
            >
              {busy ? "…" : "⤺ Revert"}
            </button>
          )}
        </div>
      )}
    </main>
  );
}

function Row({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full text-sm"
        style={{
          background: ok ? "var(--color-ok)" : "var(--color-bad)",
          color: "#000",
        }}
      >
        {ok ? "✓" : "✗"}
      </span>
      <span className="text-sm">{label}</span>
    </div>
  );
}
