/**
 * Defensive parsing for LLM responses (live adapters).
 *
 * The Anthropic Messages API has no JSON mode at 2023-06-01, so "respond only
 * with JSON" is best-effort — responses can arrive fenced or prose-wrapped, and
 * a max_tokens cutoff returns HTTP 200 with a truncated body. Parsing naively
 * with JSON.parse(content[0].text) throws on all of these. These helpers fail
 * with a clear, escalation-friendly message instead.
 */

/** Extract a JSON object from possibly-fenced / prose-wrapped LLM text. */
export function extractJson<T = unknown>(text: string): T {
  let t = (text ?? "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  if (!t.startsWith("{") && !t.startsWith("[")) {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) t = t.slice(start, end + 1);
  }
  try {
    return JSON.parse(t) as T;
  } catch {
    throw new Error(`agent returned non-JSON output: ${(text ?? "").slice(0, 200)}`);
  }
}

interface AnthropicResponse {
  stop_reason?: string;
  content?: { type?: string; text?: string }[];
}

/** Pull the text block out of an Anthropic response, refusing truncated output. */
export function anthropicText(json: AnthropicResponse): string {
  if (json.stop_reason === "max_tokens") {
    throw new Error("anthropic response truncated (max_tokens) — escalating");
  }
  const block = (json.content ?? []).find(
    (b) => b.type === "text" || typeof b.text === "string",
  );
  if (!block?.text) throw new Error("anthropic returned no text block — escalating");
  return block.text;
}
