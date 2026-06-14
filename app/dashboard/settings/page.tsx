"use client";

import { useSettings } from "@/app/_components/use-settings";
import { Section, Row, Select, FIELD } from "@/app/_components/form";
import { PageHeader, PageBody, Banner } from "@/app/_components/console";

export default function SettingsPage() {
 const { text, set, save, saving, error } = useSettings();

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

 <Section
 icon="eye"
 title="Reviewer panel"
 onSave={() => save("review", ["REVIEW_PANEL_SIZE"])}
 busy={saving === "review"}
 >
 <Row
 label="Reviewers"
 hint="Default panel size for simulation. In live mode the panel is whichever Reviewer models you assign in API keys."
 >
 <Select
 value={text("REVIEW_PANEL_SIZE", "1")}
 onChange={(v) => set("REVIEW_PANEL_SIZE", v)}
 className="min-w-[160px]"
 >
 <option value="1">1 reviewer</option>
 <option value="2">2 reviewers</option>
 <option value="3">3 reviewers</option>
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
 className={`${FIELD} w-24`}
 />
 </Row>
 <Row label="Max diff lines" hint="Total added + removed lines before a fix counts as too large.">
 <input
 type="number"
 min={1}
 value={text("POLICY_MAX_CHURN", "120")}
 onChange={(e) => set("POLICY_MAX_CHURN", e.target.value)}
 className={`${FIELD} w-24`}
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
 <Row label="Signed in as" hint="Single-tenant for now.">
 <div className="flex items-center gap-2 font-mono text-xs">
 <span className="grid h-6 w-6 place-items-center rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] text-[10px] text-[var(--color-brand-2)]">
 AR
 </span>
 founder
 </div>
 </Row>
 </Section>
 </PageBody>
 </div>
 );
}
