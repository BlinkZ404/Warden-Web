"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSettings, type UseSettings } from "@/app/_components/use-settings";
import { Section, IntegrationRow, KeyField, Select, FIELD } from "@/app/_components/form";
import { Label, PageHeader, PageBody, Banner, Button, Dot } from "@/app/_components/console";
import { Brand } from "@/app/_components/brand";
import { getOAuthProvider } from "@/lib/auth/oauth-providers";
import {
  MODEL_PROVIDERS as PROVIDERS,
  ROLE_SLOTS as ROLES,
  buildAssignment,
  parseAssignment,
} from "@/lib/models";
import { runRateUsd, usd } from "@/lib/pricing";

const OAUTH_MSG: Record<string, { text: string; tone: string }> = {
  connected: { text: "Connected.", tone: "var(--color-ok)" },
  not_configured: {
    text: "One-click connect isn't set up for this provider yet. Paste a token below instead.",
    tone: "var(--color-warn)",
  },
  state: { text: "The connection link expired. Try connecting again.", tone: "var(--color-bad)" },
  denied: { text: "Connection was cancelled or denied.", tone: "var(--color-bad)" },
  error: { text: "Couldn't connect. Try again or paste a token below.", tone: "var(--color-bad)" },
  unknown: { text: "Unknown provider.", tone: "var(--color-bad)" },
};

export default function KeysPage() {
  const s = useSettings();
  const connected = PROVIDERS.filter((p) => s.secret(p.keyName).set).length;
  const managed = s.text("BILLING_MODE", "managed") !== "byok";
  const reviewers = ROLES.filter((r) => r.key.startsWith("REVIEWER_") && s.text(r.key)).length;
  const [oauth, setOauth] = useState<{ provider: string; status: string } | null>(null);
  const [orModels, setOrModels] = useState<{ id: string; label: string }[] | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const provider = sp.get("oauth");
    const status = sp.get("status");
    if (provider && status) {
      setOauth({ provider, status });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // OpenRouter's catalog is public and shifts over time, so pull the live list
  // for its dropdown; falls back to the static list on any failure.
  useEffect(() => {
    fetch("/api/models/openrouter")
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((d) => {
        if (Array.isArray(d.models) && d.models.length) setOrModels(d.models);
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader title="api keys" />

      <PageBody className="mx-auto max-w-3xl space-y-5">
        {s.error && <Banner>{s.error}</Banner>}
        {oauth && OAUTH_MSG[oauth.status] && (
          <Banner tone={OAUTH_MSG[oauth.status].tone}>
            {oauth.provider}: {OAUTH_MSG[oauth.status].text}
          </Banner>
        )}

        <Section
          icon="shield"
          title="Inference"
          aside="managed or your own keys"
          onSave={() => s.save("billing", ["BILLING_MODE"])}
          busy={s.saving === "billing"}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="max-w-md">
              <div className="text-sm">Provider</div>
              <div className="mt-0.5 text-xs text-[var(--color-muted)]">
                Managed: Warden runs the models and meters each run from your prepaid balance, with
                no keys to paste. Bring your own keys: paste provider keys below and your provider
                bills you directly.
              </div>
            </div>
            <Select
              value={s.text("BILLING_MODE", "managed")}
              onChange={(v) => s.set("BILLING_MODE", v)}
              className="min-w-[200px]"
            >
              <option value="managed">Managed by Warden</option>
              <option value="byok">Bring your own keys</option>
            </Select>
          </div>
          <p className="text-[11px] text-[var(--color-muted)]">
            Check your balance and top up on the{" "}
            <Link href="/dashboard/usage" className="text-[var(--color-brand-2)] hover:underline">
              usage
            </Link>{" "}
            page.
          </p>
        </Section>

        <Section
          icon="key"
          title={managed ? "Models (optional keys)" : "Models"}
          aside={`${connected}/${PROVIDERS.length} connected`}
          onSave={() => s.save("providers", PROVIDERS.map((p) => p.keyName))}
          busy={s.saving === "providers"}
        >
          <p className="text-xs text-[var(--color-muted)]">
            {managed
              ? "Managed inference is on, so keys are optional. Add one only to bring your own for a provider; otherwise Warden runs the models for you. Pick which model runs each role below."
              : "Paste a key for any provider you want Warden to use. Pick which model runs each role below."}
          </p>

          <div className="border-y border-[var(--color-line)]">
            {PROVIDERS.map((p, i) => {
              const sec = s.secret(p.keyName);
              return (
                <div
                  key={p.id}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-2.5 py-3.5 ${
                    i > 0 ? "border-t border-[var(--color-line)]" : ""
                  }`}
                >
                  <div className="flex w-40 shrink-0 items-center gap-2.5">
                    <Brand actor={p.id} size={18} />
                    <span className="truncate text-sm font-medium">{p.name}</span>
                    <Dot
                      className="ml-auto"
                      title={sec.set ? "connected" : "not set"}
                      tone={sec.set ? "var(--color-ok)" : "var(--color-line)"}
                    />
                  </div>
                  <input
                    className={`${FIELD} min-w-0 flex-1`}
                    type="password"
                    autoComplete="off"
                    placeholder={sec.set ? `•••• ${sec.hint}` : p.placeholder}
                    value={s.draftVal(p.keyName)}
                    onChange={(e) => s.set(p.keyName, e.target.value)}
                  />
                </div>
              );
            })}
          </div>
        </Section>

        <Section
          icon="users"
          title="Role assignments"
          aside="which model runs each agent"
          onSave={() => s.save("roles", ROLES.map((r) => r.key))}
          busy={s.saving === "roles"}
        >
          {reviewers > 0 && (
            <p className="text-[11px] text-[var(--color-muted)]">
              Live mode runs the {reviewers} assigned reviewer{reviewers > 1 ? "s" : ""} as the
              panel, overriding the panel size in settings.
            </p>
          )}
          {ROLES.map((r) => {
            const a = parseAssignment(s.text(r.key));
            return (
              <div key={r.key} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm">{r.label}</div>
                  {r.desc && <div className="mt-0.5 text-xs text-[var(--color-muted)]">{r.desc}</div>}
                  {managed && (
                    <div className="mt-0.5 font-mono text-[10px] text-[var(--color-muted)]">
                      {usd(runRateUsd(a?.id))}/run · billed to balance
                    </div>
                  )}
                </div>
                <Select
                  value={s.text(r.key)}
                  onChange={(v) => s.set(r.key, v)}
                  className="min-w-[200px]"
                >
                  <option value="">(none)</option>
                  {PROVIDERS.map((p) => {
                    const models = p.id === "openrouter" && orModels ? orModels : p.models;
                    return (
                      <optgroup key={p.id} label={p.name}>
                        {models.map((m) => (
                          <option key={m.id} value={buildAssignment(p.id, m.id)}>
                            {m.label}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </Select>
              </div>
            );
          })}
        </Section>

        <Section
          icon="search"
          title="Error source"
          onSave={() => s.save("sentry", ["SENTRY_CLIENT_SECRET"])}
          busy={s.saving === "sentry"}
        >
          <IntegrationRow actor="sentry" name="Sentry" connected={s.secret("SENTRY_CLIENT_SECRET").set} />
          <KeyField
            label="Webhook signing secret"
            secret={s.secret("SENTRY_CLIENT_SECRET")}
            placeholder="signing secret"
            value={s.draftVal("SENTRY_CLIENT_SECRET")}
            onChange={(v) => s.set("SENTRY_CLIENT_SECRET", v)}
          />
          <p className="text-[11px] text-[var(--color-muted)]">
            Add this webhook as a Sentry internal integration; the signing secret verifies inbound
            deliveries.
          </p>
        </Section>

        <Section
          icon="deploy"
          title="Deployment"
          onSave={() => s.save("vercel", ["VERCEL_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_TEAM_ID"])}
          busy={s.saving === "vercel"}
        >
          <OAuthConnect s={s} provider="vercel" />
          <KeyField
            label="or paste a token"
            secret={s.secret("VERCEL_TOKEN")}
            placeholder="vercel token"
            value={s.draftVal("VERCEL_TOKEN")}
            onChange={(v) => s.set("VERCEL_TOKEN", v)}
          />
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="block">
              <Label>Project ID</Label>
              <input
                className={`mt-1.5 ${FIELD}`}
                placeholder="prj_…"
                value={s.text("VERCEL_PROJECT_ID")}
                onChange={(e) => s.set("VERCEL_PROJECT_ID", e.target.value)}
              />
            </label>
            <label className="block">
              <Label>Team ID</Label>
              <input
                className={`mt-1.5 ${FIELD}`}
                placeholder="team_…"
                value={s.text("VERCEL_TEAM_ID")}
                onChange={(e) => s.set("VERCEL_TEAM_ID", e.target.value)}
              />
            </label>
          </div>
        </Section>

        <Section
          icon="code"
          title="Source control"
          aside="for PR-based fixes"
          onSave={() => s.save("github", ["GITHUB_TOKEN"])}
          busy={s.saving === "github"}
        >
          <OAuthConnect s={s} provider="github" />
          <KeyField
            label="or paste a token"
            secret={s.secret("GITHUB_TOKEN")}
            placeholder="ghp_…"
            value={s.draftVal("GITHUB_TOKEN")}
            onChange={(v) => s.set("GITHUB_TOKEN", v)}
          />
        </Section>

        <Section
          icon="activity"
          title="Notifications"
          aside="slack approvals"
          onSave={() => s.save("slack", ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET", "SLACK_CHANNEL"])}
          busy={s.saving === "slack"}
        >
          <IntegrationRow actor="slack" name="Slack" connected={s.secret("SLACK_BOT_TOKEN").set} />
          <p className="text-xs text-[var(--color-muted)]">
            Get the approval card with Approve / Reject buttons in Slack. Point your app&rsquo;s
            interactivity URL at <span className="font-mono">/api/slack/interactions</span>.
          </p>
          <KeyField
            label="Bot token"
            secret={s.secret("SLACK_BOT_TOKEN")}
            placeholder="xoxb-…"
            value={s.draftVal("SLACK_BOT_TOKEN")}
            onChange={(v) => s.set("SLACK_BOT_TOKEN", v)}
          />
          <KeyField
            label="Signing secret"
            secret={s.secret("SLACK_SIGNING_SECRET")}
            placeholder="signing secret"
            value={s.draftVal("SLACK_SIGNING_SECRET")}
            onChange={(v) => s.set("SLACK_SIGNING_SECRET", v)}
          />
          <label className="block">
            <Label>Channel</Label>
            <input
              className={`mt-1.5 ${FIELD}`}
              placeholder="#incidents"
              value={s.text("SLACK_CHANNEL")}
              onChange={(e) => s.set("SLACK_CHANNEL", e.target.value)}
            />
          </label>
        </Section>
      </PageBody>
    </div>
  );
}

/** One-click OAuth connect row, driven entirely off the provider registry so a
 *  new provider needs no hand-typed label/token key. */
function OAuthConnect({ s, provider }: { s: UseSettings; provider: string }) {
  const p = getOAuthProvider(provider);
  if (!p) return null;
  const sec = s.secret(p.tokenKey);
  async function disconnect() {
    await fetch(`/api/oauth/${provider}/disconnect`, { method: "POST" });
    window.location.reload();
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3.5 py-2.5">
      <div className="flex items-center gap-2.5">
        <Brand actor={p.actor} size={18} />
        <div>
          <div className="text-sm font-medium">{p.label}</div>
          <div className="font-mono text-[11px] text-[var(--color-muted)]">
            {sec.set ? `connected · ••••${sec.hint}` : "one-click connect"}
          </div>
        </div>
      </div>
      {sec.set ? (
        <Button variant="danger" size="sm" onClick={disconnect}>
          Disconnect
        </Button>
      ) : (
        <Button href={`/api/oauth/${provider}/start`} size="sm">
          Connect {p.label}
        </Button>
      )}
    </div>
  );
}
