"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/app/_components/use-settings";
import { Section, Row, Select, FIELD } from "@/app/_components/form";
import { PageHeader, PageBody, Banner, Button } from "@/app/_components/console";
import { Icon } from "@/app/_components/icons";

export default function SettingsPage() {
 const { text, set, save, saving, error } = useSettings();
 const [pulling, setPulling] = useState(false);
 const [saved, setSaved] = useState(false);
 const [repoErr, setRepoErr] = useState<string | null>(null);
 const [repos, setRepos] = useState<{ full_name: string; private: boolean }[]>([]);

 // When GitHub is connected, list the account's repos for the picker; the manual
 // owner/name field stays as a fallback (URLs, or repos not in the first page).
 useEffect(() => {
 fetch("/api/repos")
 .then((r) => (r.ok ? r.json() : { repos: [] }))
 .then((d) => setRepos(d.repos ?? []))
 .catch(() => {});
 }, []);

 async function saveRepo() {
 setPulling(true);
 setRepoErr(null);
 setSaved(false);
 try {
 // Just persist the URL. The worker clones the repo on the first incident;
 // cloning needs git + a real filesystem, which the serverless app lacks.
 await save("repo", ["TARGET_REPO_URL"]);
 setSaved(true);
 } catch {
 setRepoErr("Couldn't save. Try again.");
 } finally {
 setPulling(false);
 }
 }

 return (
 <div>
 <PageHeader title="settings" />

 <PageBody className="mx-auto max-w-3xl space-y-5">
 {error && <Banner>{error}</Banner>}
 <Section
 icon="shield"
 title="Run mode"
 onSave={() => save("mode", ["WARDEN_MODE"])}
 busy={saving === "mode"}
 >
 <Row label="Mode" hint="Simulation never touches real services. Live uses your saved keys.">
 <Select
 value={text("WARDEN_MODE", "simulation")}
 onChange={(v) => set("WARDEN_MODE", v)}
 className="min-w-[160px]"
 >
 <option value="simulation">simulation</option>
 <option value="live">live</option>
 </Select>
 </Row>
 </Section>

 <Section icon="code" title="Target repository" aside="link a GitHub repo">
 {repos.length > 0 && (
 <Row label="Your repositories" hint="From your connected GitHub account.">
 <Select
 value={repos.some((r) => r.full_name === text("TARGET_REPO_URL")) ? text("TARGET_REPO_URL") : ""}
 onChange={(v) => {
 if (v) set("TARGET_REPO_URL", v);
 }}
 className="min-w-[220px]"
 >
 <option value="">Select a repository…</option>
 {repos.map((r) => (
 <option key={r.full_name} value={r.full_name}>
 {r.full_name}
 {r.private ? " (private)" : ""}
 </option>
 ))}
 </Select>
 </Row>
 )}
 <Row
 label="GitHub repo"
 hint="owner/name or a github.com URL. For a private repo, connect GitHub in API keys first. Leave blank to use the bundled sample app."
 >
 <input
 type="text"
 spellCheck={false}
 placeholder="acme/checkout-service"
 value={text("TARGET_REPO_URL")}
 onChange={(e) => set("TARGET_REPO_URL", e.target.value)}
 className={`${FIELD} w-full sm:w-72`}
 />
 </Row>
 <div className="flex flex-wrap items-center gap-3 pt-1">
 <Button variant="secondary" size="sm" onClick={saveRepo} disabled={pulling}>
 {pulling ? "Saving…" : "Save repository"}
 </Button>
 {saved && (
 <span className="font-mono text-[11px] text-[var(--color-ok)]">
 ✓ Saved. Warden clones it on the first incident.
 </span>
 )}
 {repoErr && (
 <span className="font-mono text-[11px] text-[var(--color-bad)]">{repoErr}</span>
 )}
 </div>
 </Section>

 <Section
 icon="code"
 title="Build & run"
 aside="how Warden boots your app to verify"
 onSave={() => save("boot", ["INSTALL_COMMAND", "BUILD_COMMAND", "RUN_COMMAND"])}
 busy={saving === "boot"}
 >
 <Row
 label="Install"
 hint="Run once before boot to install dependencies. Defaults to npm ci or npm install. Leave blank for a zero-dependency app."
 >
 <input
 type="text"
 spellCheck={false}
 placeholder="npm ci"
 value={text("INSTALL_COMMAND")}
 onChange={(e) => set("INSTALL_COMMAND", e.target.value)}
 className={`${FIELD} w-full sm:w-56`}
 />
 </Row>
 <Row
 label="Build"
 hint="Build step before boot, e.g. next build. Leave blank if your app needs none."
 >
 <input
 type="text"
 spellCheck={false}
 placeholder="next build"
 value={text("BUILD_COMMAND")}
 onChange={(e) => set("BUILD_COMMAND", e.target.value)}
 className={`${FIELD} w-full sm:w-56`}
 />
 </Row>
 <Row
 label="Start"
 hint="Command that starts your app. Defaults to package.json start, then node server.js. Warden provides PORT."
 >
 <input
 type="text"
 spellCheck={false}
 placeholder="next start"
 value={text("RUN_COMMAND")}
 onChange={(e) => set("RUN_COMMAND", e.target.value)}
 className={`${FIELD} w-full sm:w-56`}
 />
 </Row>
 </Section>

 <Section
 icon="flag"
 title="Delivery"
 aside="how a verified fix ships"
 onSave={() => save("delivery", ["DELIVERY_MODE"])}
 busy={saving === "delivery"}
 >
 <Row
 label="On approval"
 hint="Preview: Warden promotes its own Vercel deploy. Open a PR: a pull request on your linked repo for review. Merge: the verified fix goes to your branch so your existing CI/CD ships it."
 >
 <Select
 value={text("DELIVERY_MODE", text("TARGET_REPO_URL").trim() ? "pr" : "preview")}
 onChange={(v) => set("DELIVERY_MODE", v)}
 className="min-w-[220px]"
 >
 <option value="preview">Preview deploy (Vercel)</option>
 <option value="pr">Open a PR</option>
 <option value="merge">Merge &amp; let CI/CD ship</option>
 </Select>
 </Row>
 </Section>

 <Section
 icon="deploy"
 title="Autopilot"
 aside="auto-approve verified fixes"
 onSave={() => save("autopilot", ["AUTO_APPROVE"])}
 busy={saving === "autopilot"}
 >
 <Row
 label="Auto-approve"
 hint="On: a fix that passes verification ships without waiting for your tap. Reversibility and auto-rollback are the safety net, and any guardrail hit or reviewer disagreement still escalates to you."
 >
 <Select
 value={text("AUTO_APPROVE", "false")}
 onChange={(v) => set("AUTO_APPROVE", v)}
 className="min-w-[180px]"
 >
 <option value="false">Off (You Approve)</option>
 <option value="true">On (Autopilot)</option>
 </Select>
 </Row>
 </Section>

 <Section
 icon="shieldCheck"
 title="Guardrails"
 aside="blast-radius policy"
 onSave={() =>
 save("guardrails", ["POLICY_MAX_FILES", "POLICY_MAX_CHURN", "POLICY_DENY_GLOBS"])
 }
 busy={saving === "guardrails"}
 >
 <Row label="Max files" hint="A fix touching more files than this escalates instead of shipping.">
 <input
 type="number"
 min={1}
 value={text("POLICY_MAX_FILES", "5")}
 onChange={(e) => set("POLICY_MAX_FILES", e.target.value)}
 className={`${FIELD} sm:w-24`}
 />
 </Row>
 <Row label="Max diff lines" hint="Total added + removed lines before a fix counts as too large.">
 <input
 type="number"
 min={1}
 value={text("POLICY_MAX_CHURN", "120")}
 onChange={(e) => set("POLICY_MAX_CHURN", e.target.value)}
 className={`${FIELD} sm:w-24`}
 />
 </Row>
 <div>
 <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
 Protected paths
 </div>
 <p className="mt-1 text-xs text-[var(--color-muted)]">
 One glob per line. A fix touching any of these escalates and is never shipped without you.
 </p>
 <textarea
 rows={3}
 spellCheck={false}
 placeholder={"**/auth/**\n**/billing/**\nmigrations/*"}
 value={text("POLICY_DENY_GLOBS")}
 onChange={(e) => set("POLICY_DENY_GLOBS", e.target.value)}
 className={`mt-1.5 ${FIELD} resize-none leading-relaxed`}
 />
 </div>
 </Section>

 <Section icon="gear" title="Account">
 <Row label="Signed in as" hint="Open access for the demo; no login required.">
 <div className="flex items-center gap-2 font-mono text-xs">
 <span className="grid h-6 w-6 place-items-center rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] text-[var(--color-brand-2)]">
 <Icon name="user" size={14} />
 </span>
 Guest Mode
 </div>
 </Row>
 </Section>
 </PageBody>
 </div>
 );
}
