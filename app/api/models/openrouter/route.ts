/**
 * Live OpenRouter model catalog for the role-assignment dropdown.
 *
 * OpenRouter's /models list is public (no key needed) and changes over time, so
 * we serve it live (cached) rather than hardcoding a list that goes stale. The
 * pipeline is unaffected: a role assignment is just a "provider::model" string,
 * so whatever id is picked here flows straight through to the worker.
 */
export const runtime = "nodejs";
export const revalidate = 3600;

interface ORModel {
  id: string;
  name?: string;
  architecture?: { output_modalities?: string[] };
}

export async function GET() {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return Response.json({ models: [] });
    const json = (await res.json()) as { data?: ORModel[] };
    const models = (json.data ?? [])
      // Keep text-output models; drop image/audio-only generators.
      .filter((m) => {
        const out = m.architecture?.output_modalities;
        return !out || out.includes("text");
      })
      .map((m) => ({ id: m.id, label: m.name ?? m.id }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return Response.json({ models });
  } catch {
    // Network/parse failure: the dashboard falls back to the static list.
    return Response.json({ models: [] });
  }
}
