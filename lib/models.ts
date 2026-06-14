/**
 * The provider / model catalog (client-safe data, no server deps).
 *
 * One source of truth shared by the API-keys page (renders the connection cards
 * and role dropdowns) and the usage page (resolves a stored assignment back to a
 * readable label). A role assignment is stored in settings as
 * `"<providerId>::<modelId>"`; `parseAssignment` turns that back into the
 * provider id (for the logo) plus the display label.
 *
 * Model lists reflect each provider's current API-selectable line-up.
 */

export interface CatalogModel {
 label: string;
 id: string;
}

export interface ModelProvider {
 id: string;
 name: string;
 keyName: string;
 /** OpenAI-compatible chat endpoint the runtime calls when this provider runs a role. */
 baseUrl: string;
 placeholder: string;
 models: CatalogModel[];
}

export const MODEL_PROVIDERS: ModelProvider[] = [
 {
 id: "claude",
 name: "Claude",
 keyName: "ANTHROPIC_API_KEY",
 baseUrl: "https://api.anthropic.com/v1",
 placeholder: "sk-ant-…",
 models: [
 { label: "Claude Fable 5", id: "claude-fable-5" },
 { label: "Claude Opus 4.8", id: "claude-opus-4-8" },
 { label: "Claude Sonnet 4.6", id: "claude-sonnet-4-6" },
 { label: "Claude Haiku 4.5", id: "claude-haiku-4-5" },
 ],
 },
 {
 id: "openai",
 name: "OpenAI",
 keyName: "OPENAI_API_KEY",
 baseUrl: "https://api.openai.com/v1",
 placeholder: "sk-…",
 models: [
 { label: "GPT-5.5", id: "gpt-5.5" },
 { label: "GPT-5.5 Pro", id: "gpt-5.5-pro" },
 { label: "GPT-5.4", id: "gpt-5.4" },
 { label: "GPT-5.4 mini", id: "gpt-5.4-mini" },
 ],
 },
 {
 id: "gemini",
 name: "Gemini",
 keyName: "GEMINI_API_KEY",
 baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
 placeholder: "AIza…",
 models: [
 { label: "Gemini 3.5 Flash", id: "gemini-3.5-flash" },
 { label: "Gemini 3.1 Pro", id: "gemini-3.1-pro-preview" },
 { label: "Gemini 3.1 Flash-Lite", id: "gemini-3.1-flash-lite" },
 { label: "Gemini 2.5 Pro", id: "gemini-2.5-pro" },
 ],
 },
 {
 id: "grok",
 name: "Grok",
 keyName: "XAI_API_KEY",
 baseUrl: "https://api.x.ai/v1",
 placeholder: "xai-…",
 models: [
 { label: "Grok 4.3", id: "grok-4.3" },
 { label: "Grok 4.20 Reasoning", id: "grok-4.20-0309-reasoning" },
 { label: "Grok 4.20", id: "grok-4.20-0309-non-reasoning" },
 { label: "Grok Build 0.1", id: "grok-build-0.1" },
 ],
 },
 {
 id: "zai",
 name: "Z.ai",
 keyName: "ZAI_API_KEY",
 baseUrl: "https://api.z.ai/api/paas/v4",
 placeholder: "z.ai key",
 models: [
 { label: "GLM-5.1", id: "glm-5.1" },
 { label: "GLM-4.7", id: "glm-4.7" },
 { label: "GLM-4.6", id: "glm-4.6" },
 { label: "GLM-4.5 Air", id: "glm-4.5-air" },
 ],
 },
 {
 id: "cursor",
 name: "Cursor",
 keyName: "CURSOR_API_KEY",
 baseUrl: "https://api.cursor.com/v1",
 placeholder: "crsr_…",
 models: [
 { label: "Composer 2.5", id: "composer-2-5" },
 { label: "Composer 2", id: "composer-2" },
 ],
 },
 {
 id: "minimax",
 name: "MiniMax",
 keyName: "MINIMAX_API_KEY",
 baseUrl: "https://api.minimax.io/v1",
 placeholder: "API key",
 models: [
 { label: "MiniMax-M3", id: "MiniMax-M3" },
 { label: "MiniMax-M2.7", id: "MiniMax-M2.7" },
 { label: "MiniMax-M2.5", id: "MiniMax-M2.5" },
 { label: "MiniMax-M2.1", id: "MiniMax-M2.1" },
 ],
 },
 {
 id: "kimi",
 name: "Kimi",
 keyName: "KIMI_API_KEY",
 baseUrl: "https://api.moonshot.ai/v1",
 placeholder: "sk-…",
 models: [
 { label: "Kimi K2.7 Code", id: "kimi-k2.7-code" },
 { label: "Kimi K2.6", id: "kimi-k2.6" },
 { label: "Kimi K2.5", id: "kimi-k2.5" },
 { label: "Moonshot v1 128k", id: "moonshot-v1-128k" },
 ],
 },
 {
 id: "deepseek",
 name: "DeepSeek",
 keyName: "DEEPSEEK_API_KEY",
 baseUrl: "https://api.deepseek.com/v1",
 placeholder: "sk-…",
 models: [
 { label: "DeepSeek V4 Pro", id: "deepseek-v4-pro" },
 { label: "DeepSeek V4 Flash", id: "deepseek-v4-flash" },
 { label: "DeepSeek Chat", id: "deepseek-chat" },
 { label: "DeepSeek Reasoner", id: "deepseek-reasoner" },
 ],
 },
 {
 id: "nvidia",
 name: "NVIDIA",
 keyName: "NVIDIA_API_KEY",
 baseUrl: "https://integrate.api.nvidia.com/v1",
 placeholder: "nvapi-…",
 models: [
 { label: "Nemotron 3 Ultra", id: "nvidia/nemotron-3-ultra-550b-a55b" },
 { label: "Nemotron 3 Super", id: "nvidia/nemotron-3-super-120b-a12b" },
 { label: "Nemotron 3 Nano Omni", id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning" },
 { label: "Nemotron 3 Nano", id: "nvidia/nemotron-3-nano-30b-a3b" },
 ],
 },
];

export interface RoleSlot {
 key: string;
 label: string;
 desc: string;
}

export const ROLE_SLOTS: RoleSlot[] = [
 { key: "FIXER_MODEL", label: "Fixer", desc: "Writes the patch." },
 { key: "INVESTIGATOR_MODEL", label: "Investigator", desc: "Diagnoses the root cause." },
 { key: "REVIEWER_1_MODEL", label: "Reviewer 1", desc: "Independent cross-check." },
 { key: "REVIEWER_2_MODEL", label: "Reviewer 2", desc: "Second opinion." },
 { key: "REVIEWER_3_MODEL", label: "Reviewer 3", desc: "Tie-breaker." },
];

/** Encode a role assignment as the `"<providerId>::<modelId>"` settings value. */
export function buildAssignment(providerId: string, modelId: string): string {
 return `${providerId}::${modelId}`;
}

/** Resolve a stored `"<providerId>::<modelId>"` assignment to id + display label. */
export function parseAssignment(value: unknown): { pid: string; id: string; label: string } | null {
 if (typeof value !== "string" || !value) return null;
 const [pid, ...rest] = value.split("::");
 const id = rest.join("::");
 const model = MODEL_PROVIDERS.find((p) => p.id === pid)?.models.find((m) => m.id === id);
 // `||` not `??`: a separator-less value yields id === "" which must fall through to pid.
 return { pid, id, label: model?.label || id || pid };
}
