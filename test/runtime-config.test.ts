import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDatabase } from "./util";
import { setSettings } from "@/lib/repo/settings";
import {
 hydrateSettings,
 effectiveMode,
 isLiveRuntime,
 assignedProvider,
 assignedReviewers,
} from "@/lib/runtime-config";

/**
 * Proves the settings saved by the dashboard actually reach the pipeline: run
 * mode, provider keys, and role→model assignments are hydrated from the DB into
 * the runtime overlay rather than read only from the ambient environment.
 */
describe("runtime config; saved settings reach the pipeline", () => {
 beforeEach(async () => {
 await resetDatabase();
 await hydrateSettings(); // overlay now reflects the (empty) settings table
 });
 afterAll(async () => {
 await resetDatabase();
 await hydrateSettings(); // clear the process overlay for any later run
 });

 it("hydrates run mode from the settings table", async () => {
 expect(effectiveMode()).toBe("simulation"); // nothing saved yet
 await setSettings({ WARDEN_MODE: "live" });
 await hydrateSettings();
 expect(effectiveMode()).toBe("live");
 expect(isLiveRuntime()).toBe(true);
 });

 it("resolves a role assignment + provider key into an OpenAI-compatible provider", async () => {
 await setSettings({
 FIXER_MODEL: "claude::claude-opus-4-8",
 ANTHROPIC_API_KEY: "sk-ant-test",
 });
 await hydrateSettings();
 expect(assignedProvider("FIXER_MODEL")).toEqual({
 baseUrl: "https://api.anthropic.com/v1",
 apiKey: "sk-ant-test",
 model: "claude-opus-4-8",
 });
 // An unassigned role resolves to null so the caller falls back to env/sim.
 expect(assignedProvider("INVESTIGATOR_MODEL")).toBeNull();
 });

 it("returns null for an assignment whose provider key is missing (degrades, never half-runs)", async () => {
 await setSettings({ FIXER_MODEL: "grok::grok-4.3" }); // no XAI_API_KEY saved
 await hydrateSettings();
 if (!process.env.XAI_API_KEY) {
 expect(assignedProvider("FIXER_MODEL")).toBeNull();
 }
 });

 it("builds the reviewer panel from saved assignments", async () => {
 await setSettings({
 REVIEWER_1_MODEL: "openai::gpt-5.5",
 OPENAI_API_KEY: "sk-test",
 REVIEWER_2_MODEL: "deepseek::deepseek-v4-pro",
 DEEPSEEK_API_KEY: "sk-ds",
 });
 await hydrateSettings();
 const panel = assignedReviewers();
 expect(panel).toHaveLength(2);
 expect(panel[0].model).toBe("gpt-5.5");
 expect(panel[1].baseUrl).toBe("https://api.deepseek.com/v1");
 });
});
