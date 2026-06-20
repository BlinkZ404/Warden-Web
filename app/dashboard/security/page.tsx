"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Frame,
  Plus,
  Label,
  Button,
  StatTiles,
  PageHeader,
  PageBody,
  Loading,
} from "@/app/_components/console";
import { openFindings, type TablePosture, type Severity } from "@/lib/security/rls";

interface ScanResponse {
  postures: TablePosture[];
}

const SEV_TONE: Record<Severity, string> = {
  critical: "var(--color-bad)",
  high: "var(--color-warn)",
  medium: "var(--color-muted)",
};

export default function Security() {
  const [data, setData] = useState<ScanResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/security", { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function secure(table: string) {
    setBusy(table);
    try {
      await fetch("/api/security/secure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ table, decidedBy: "founder" }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="security" />
        <PageBody>
          <Loading />
        </PageBody>
      </div>
    );
  }

  const open = openFindings(data.postures);
  const secured = data.postures.filter((p) => p.status === "secured");
  const safe = data.postures.filter((p) => p.status === "protected" || p.status === "intentional");
  const critical = open.filter((p) => p.severity === "critical").length;

  return (
    <div>
      <PageHeader
        title="security"
        aside={
          <span className="font-mono text-[11px] text-[var(--color-muted)]">
            row-level security scan
          </span>
        }
      />

      <PageBody className="space-y-6">
        <StatTiles
          size="sm"
          tiles={[
            {
              label: "Open exposures",
              value: String(open.length),
              hint: "tables readable by anyone",
              tone: open.length ? "var(--color-bad)" : "var(--color-ok)",
            },
            {
              label: "Critical",
              value: String(critical),
              hint: "PII / payment data",
              tone: critical ? "var(--color-bad)" : "var(--color-ok)",
            },
            {
              label: "Secured by you",
              value: String(secured.length),
              hint: "one-tap fixes applied",
              tone: "var(--color-ok)",
            },
            {
              label: "Already protected",
              value: String(safe.length),
              hint: "RLS on or public by design",
            },
          ]}
        />

        {open.length === 0 ? (
          <Frame innerClassName="px-6 py-8">
            <p className="text-center text-sm text-[var(--color-ok)]">
              No open exposures. Every private table denies the anonymous key.
            </p>
          </Frame>
        ) : (
          <div>
            <div className="mb-2.5 flex items-center gap-2">
              <Label>open exposures</Label>
              <span className="font-mono text-[10px] text-[var(--color-muted)]">[{open.length}]</span>
            </div>
            <div className="space-y-3">
              {open.map((p) => (
                <Finding key={p.name} p={p} busy={busy === p.name} onSecure={() => secure(p.name)} />
              ))}
            </div>
          </div>
        )}

        {(secured.length > 0 || safe.length > 0) && (
          <div>
            <div className="mb-2.5 flex items-center gap-2">
              <Label>protected</Label>
              <span className="font-mono text-[10px] text-[var(--color-muted)]">
                [{secured.length + safe.length}]
              </span>
            </div>
            <Frame innerClassName="divide-y divide-[var(--color-line)]">
              {[...secured, ...safe].map((p) => (
                <div key={p.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="font-mono text-xs text-[var(--color-text)]">{p.name}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ok)]">
                    {p.status === "secured"
                      ? "secured ✓"
                      : p.status === "intentional"
                        ? "public by design"
                        : "rls on"}
                  </span>
                </div>
              ))}
            </Frame>
          </div>
        )}
      </PageBody>
    </div>
  );
}

function Finding({
  p,
  busy,
  onSecure,
}: {
  p: TablePosture;
  busy: boolean;
  onSecure: () => void;
}) {
  const [showSql, setShowSql] = useState(false);
  return (
    <div className="relative">
      <div
        className="p-5"
        style={{
          border: `1px solid color-mix(in srgb, ${SEV_TONE[p.severity]} 35%, var(--color-line))`,
          background: `color-mix(in srgb, ${SEV_TONE[p.severity]} 6%, var(--color-panel))`,
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="font-mono text-[10px] uppercase tracking-wider"
            style={{ color: SEV_TONE[p.severity] }}
          >
            {p.severity}
          </span>
          <span className="font-mono text-xs text-[var(--color-text)]">{p.name}</span>
        </div>
        <p className="mt-2 text-sm font-semibold tracking-tight">{p.title}</p>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--color-muted)]">
          {p.explanation}
        </p>

        <button
          onClick={() => setShowSql((s) => !s)}
          className="mt-3 cursor-pointer font-mono text-[11px] text-[var(--color-brand-2)] transition hover:underline"
        >
          {showSql ? "hide" : "view"} the fix Warden will apply
        </button>
        {showSql && (
          <pre className="mt-2 overflow-x-auto rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] p-3 font-mono text-[11px] leading-relaxed text-[var(--color-text)]">
            {p.policySql}
          </pre>
        )}

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={onSecure} disabled={busy} size="sm">
            {busy ? "Securing…" : "Secure this table"}
          </Button>
          <span className="text-[11px] text-[var(--color-muted)]">
            One tap. Verified after: the anonymous key can no longer read it.
          </span>
        </div>
      </div>
      <Plus at="tl" />
      <Plus at="tr" />
      <Plus at="bl" />
      <Plus at="br" />
    </div>
  );
}
