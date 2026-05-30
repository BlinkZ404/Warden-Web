/**
 * Generic OpenAI-compatible chat client. Lets any agent run on any provider that
 * speaks the OpenAI /chat/completions API — DeepSeek, GLM (Z.ai/Zhipu), OpenAI,
 * OpenRouter, Together, a local Ollama, etc. — purely via config (base URL + key
 * + model). This is the vendor-neutral agent seam (PLAN §3/§15) made real.
 */
import { openaiText, extractJson } from "@/lib/agents/json";
import { httpError } from "@/lib/http";

export interface CompatProvider {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function isConfigured(p: CompatProvider): boolean {
  return !!(p.baseUrl && p.apiKey && p.model);
}

/** Call an OpenAI-compatible chat endpoint and parse a JSON-object reply. */
export async function chatJson<T>(
  p: CompatProvider,
  system: string,
  user: string,
): Promise<T> {
  const base = p.baseUrl.replace(/\/+$/, "");
  const url = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${p.apiKey}`,
    },
    body: JSON.stringify({
      model: p.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) await httpError(`agent(${p.model})`, res);
  return extractJson<T>(openaiText(await res.json()));
}
