"use client";

import { useState } from "react";
import type { Usage } from "@/lib/repo/usage";
import {
  Frame,
  Grid,
  Cell,
  Label,
  Chip,
  Button,
  StatTiles,
  PageHeader,
  PageBody,
  Loading,
  Empty,
  ErrorState,
  Banner,
} from "@/app/_components/console";
import { Brand, actorLabel } from "@/app/_components/brand";
import { Icon } from "@/app/_components/icons";
import { usePolled } from "@/app/_components/use-polled";
import { ROLE_SLOTS as ROLES, parseAssignment } from "@/lib/models";
import { usd, runRateUsd, TOPUP_OPTIONS_USD, LOW_BALANCE_USD } from "@/lib/pricing";
import type { LedgerEntry } from "@/lib/repo/wallet";
import type { BillingMode } from "@/lib/billing";

interface Billing {
  balance: number;
  spent: number;
  mode: BillingMode;
  ledger: LedgerEntry[];
}

const header = (
  <span className="font-mono text-[11px] text-[var(--color-muted)]">
    billing period · all time
  </span>
);

export default function UsagePage() {
  const { data: u, error, loaded, reload } = usePolled<Usage>(
    "/api/usage",
    (j) => (j as { usage: Usage }).usage,
    5000,
  );
  const { data: settings } = usePolled<Record<string, unknown>>(
    "/api/settings",
    (j) => (j as { settings: Record<string, unknown> }).settings ?? {},
    0,
  );
  const { data: billing, reload: reloadBilling } = usePolled<Billing>(
    "/api/billing",
    (j) => (j as { billing: Billing }).billing,
    4000,
  );

  if (!u) {
    return (
      <div>
        <PageHeader title="usage" aside={header} />
        <PageBody>
          {error ? (
            <ErrorState onRetry={reload} />
          ) : loaded ? (
            <Empty>No usage yet. Trigger an incident from the dashboard.</Empty>
          ) : (
            <Loading />
          )}
        </PageBody>
      </div>
    );
  }

  const maxRuns = Math.max(...u.byActor.map((a) => a.runs), 1);

  return (
    <div>
      <PageHeader title="usage" aside={header} />
      <PageBody className="space-y-6">
        {error && (
          <Banner tone="var(--color-warn)">Couldn&rsquo;t refresh. Showing the last update.</Banner>
        )}
        <StatTiles
          tiles={[
            { label: "Incidents", value: String(u.incidents), hint: `${u.resolved} resolved` },
            {
              label: "Agent runs",
              value: String(u.agentRuns),
              hint: `${u.events} log events`,
              tone: "var(--color-brand-2)",
            },
            {
              label: "Fixes shipped",
              value: String(u.shipped),
              hint: "promoted to prod",
              tone: "var(--color-ok)",
            },
            {
              label: "Wallet balance",
              value: billing ? usd(billing.balance) : "—",
              hint: billing ? `${usd(billing.spent)} metered` : "managed inference",
              tone:
                billing && billing.balance < LOW_BALANCE_USD
                  ? "var(--color-warn)"
                  : "var(--color-ok)",
            },
          ]}
        />

        {billing && <WalletPanel billing={billing} onChange={reloadBilling} />}

        <Grid cols="grid-cols-1 lg:grid-cols-2">
          <Cell icon={<Icon name="activity" />} title="Runs by model">
            {u.byActor.length === 0 ? (
              <p className="font-mono text-xs text-[var(--color-muted)]">no agent runs yet</p>
            ) : (
              <div className="space-y-2.5">
                {u.byActor.map((a) => (
                  <div key={a.actor} className="flex items-center gap-3">
                    <span className="flex w-28 shrink-0 items-center gap-1.5 text-xs">
                      <Brand actor={a.actor} size={14} />
                      {actorLabel(a.actor)}
                    </span>
                    <div className="h-3 flex-1 overflow-hidden rounded-sm bg-[var(--color-panel-2)]">
                      <div
                        className="h-full rounded-sm bg-[var(--color-accent)]"
                        style={{ width: `${(a.runs / maxRuns) * 100}%`, minWidth: 4 }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right font-mono text-xs">{a.runs}</span>
                  </div>
                ))}
              </div>
            )}
          </Cell>

          <Cell icon={<Icon name="key" />} title="Active models" aside="rate per run">
            <div className="space-y-2">
              {ROLES.map((r) => {
                const a = parseAssignment(settings?.[r.key]);
                return (
                  <div key={r.key} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-[var(--color-muted)]">{r.label}</span>
                    {a ? (
                      <span className="flex items-center gap-2 font-mono text-[var(--color-text)]">
                        <Brand actor={a.pid} size={14} />
                        {a.label}
                        <span className="text-[var(--color-muted)]">
                          {usd(runRateUsd(a.id))}/run
                        </span>
                      </span>
                    ) : (
                      <span className="font-mono text-[var(--color-muted)]">
                        managed default {usd(runRateUsd(null))}/run
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Cell>
        </Grid>

        <div>
          <div className="mb-2.5 flex items-center gap-2">
            <Label>events by type</Label>
            <span className="font-mono text-[10px] text-[var(--color-muted)]">[{u.events}]</span>
          </div>
          <Frame innerClassName="flex flex-wrap gap-2 px-5 py-4">
            {u.byType.length === 0 ? (
              <span className="font-mono text-xs text-[var(--color-muted)]">no events yet</span>
            ) : (
              u.byType.map((t) => (
                <Chip key={t.type} uppercase>
                  {t.type.replace(/_/g, " ")} <b className="text-[var(--color-text)]">{t.count}</b>
                </Chip>
              ))
            )}
          </Frame>
        </div>

        <p className="font-mono text-[10px] text-[var(--color-muted)]">
          Managed inference is metered per agent run at the selected model&rsquo;s published rate and
          drawn from your prepaid balance.
        </p>
      </PageBody>
    </div>
  );
}

/** Prepaid wallet: balance, top-up, and the metered ledger. */
function WalletPanel({ billing, onChange }: { billing: Billing; onChange: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const low = billing.balance < LOW_BALANCE_USD;

  async function topUp(amount: number) {
    setBusy(amount);
    try {
      await fetch("/api/billing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      await onChange();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <Label>wallet</Label>
        <Chip uppercase tone={billing.mode === "managed" ? "var(--color-brand-2)" : undefined}>
          {billing.mode === "managed" ? "managed inference" : "bring your own keys"}
        </Chip>
      </div>
      <Frame innerClassName="p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
              Balance
            </div>
            <div
              className="mt-1 font-mono text-3xl font-semibold"
              style={{ color: low ? "var(--color-warn)" : "var(--color-ok)" }}
            >
              {usd(billing.balance)}
            </div>
            <div className="mt-1 text-[11px] text-[var(--color-muted)]">
              {usd(billing.spent)} metered this period
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Label>top up</Label>
            {TOPUP_OPTIONS_USD.map((amt) => (
              <Button
                key={amt}
                variant="secondary"
                size="sm"
                disabled={busy !== null}
                onClick={() => topUp(amt)}
              >
                {busy === amt ? "…" : `+ ${usd(amt)}`}
              </Button>
            ))}
          </div>
        </div>

        {low && (
          <p className="mt-3 font-mono text-[11px] text-[var(--color-warn)]">
            Low balance. Managed inference pauses new incidents at $0 until you top up.
          </p>
        )}

        {billing.ledger.length > 0 && (
          <div className="mt-4 border-t border-[var(--color-line)] pt-3">
            <Label>recent activity</Label>
            <div className="mt-2 space-y-1.5 font-mono text-[11px]">
              {billing.ledger.slice(0, 6).map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[var(--color-muted)]">
                    {e.kind === "topup" ? "Top-up" : e.model || e.description || "Agent run"}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span
                      style={{
                        color: e.kind === "topup" ? "var(--color-ok)" : "var(--color-muted)",
                      }}
                    >
                      {e.kind === "topup" ? "+" : "−"}
                      {usd(Math.abs(e.amount_usd))}
                    </span>
                    <span className="w-14 text-right text-[var(--color-text)]">
                      {usd(e.balance_after)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-3 text-xs leading-relaxed text-[var(--color-muted)]">
          {billing.mode === "managed"
            ? "Warden runs the models for you and meters each run from this balance. Top up like any API account; no provider keys to manage."
            : "You're on bring-your-own-keys: your provider bills you directly and Warden meters nothing. Switch to managed in API keys to run on a Warden balance."}
        </p>
      </Frame>
    </div>
  );
}
