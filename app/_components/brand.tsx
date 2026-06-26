"use client";

import { useState } from "react";

const BRANDS: Record<string, { domain?: string; label: string; color: string }> = {
 claude: { domain: "anthropic.com", label: "Claude", color: "#d97757" },
 openai: { domain: "openai.com", label: "OpenAI", color: "#10a37f" },
 codex: { domain: "openai.com", label: "OpenAI", color: "#10a37f" },
 gemini: { domain: "gemini.google.com", label: "Gemini", color: "#4285f4" },
 grok: { domain: "grok.com", label: "Grok", color: "#e7eaf0" },
 zai: { domain: "z.ai", label: "Z.ai", color: "#5c6795" },
 cursor: { domain: "cursor.com", label: "Cursor", color: "#e7eaf0" },
 minimax: { domain: "minimax.io", label: "MiniMax", color: "#f5455c" },
 kimi: { domain: "moonshot.ai", label: "Kimi", color: "#7c4dff" },
 deepseek: { domain: "deepseek.com", label: "DeepSeek", color: "#4d6bfe" },
 nvidia: { domain: "nvidia.com", label: "NVIDIA", color: "#76b900" },
 openrouter: { domain: "openrouter.ai", label: "OpenRouter", color: "#6467f2" },
 sentry: { domain: "sentry.io", label: "Sentry", color: "#9b6dcf" },
 vercel: { domain: "vercel.com", label: "Vercel", color: "#e7eaf0" },
 slack: { domain: "slack.com", label: "Slack", color: "#e01e5a" },
 github: { domain: "github.com", label: "GitHub", color: "#e7eaf0" },
 system: { label: "System", color: "#5c6795" },
 "demo-script": { label: "System", color: "#5c6795" },
};

/** Display name for an event actor (`human:founder` → `Founder`, etc.). */
export function actorLabel(actor: string): string {
 if (actor.startsWith("human:")) {
 const n = actor.slice(6);
 return n ? n.charAt(0).toUpperCase() + n.slice(1) : "Human";
 }
 if (actor.startsWith("system:")) {
 return actor.slice(7) === "auto-approve" ? "Autopilot" : "System";
 }
 const b = BRANDS[actor.toLowerCase()];
 if (b) return b.label;
 return actor.charAt(0).toUpperCase() + actor.slice(1);
}

/** A brand logo for an actor, falling back to a coloured letter chip. */
export function Brand({ actor, size = 16 }: { actor: string; size?: number }) {
 const key = actor.toLowerCase().split(":")[0];
 const brand = BRANDS[key];
 const [err, setErr] = useState(false);
 const label = actorLabel(actor);
 const color = brand?.color ?? "#5c6795";

 if (brand?.domain && !err) {
 return (
 // eslint-disable-next-line @next/next/no-img-element
 <img
 src={`https://www.google.com/s2/favicons?domain=${brand.domain}&sz=64`}
 width={size}
 height={size}
 alt=""
 className="rounded-[3px]"
 onError={() => setErr(true)}
 />
 );
 }
 return (
 <span
 role="img"
 aria-label={label}
 className="grid shrink-0 place-items-center rounded-[3px] font-mono text-[9px] font-bold"
 style={{
 width: size,
 height: size,
 color,
 background: `color-mix(in srgb, ${color} 16%, transparent)`,
 border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
 }}
 >
 {label.charAt(0).toUpperCase()}
 </span>
 );
}
