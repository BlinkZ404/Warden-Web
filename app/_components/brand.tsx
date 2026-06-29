"use client";

import { useState } from "react";
import { brandKeyForModelId, labelForModelId } from "@/lib/models";
import { Icon } from "@/app/_components/icons";

const BRANDS: Record<string, { domain?: string; icon?: string; label: string; color: string }> = {
 claude: { domain: "anthropic.com", label: "Claude", color: "#d97757" },
 openai: { domain: "openai.com", label: "OpenAI", color: "#10a37f" },
 codex: { domain: "openai.com", label: "OpenAI", color: "#10a37f" },
 gemini: { domain: "gemini.google.com", label: "Gemini", color: "#4285f4" },
 grok: { domain: "grok.com", label: "Grok", color: "#e7eaf0" },
 zai: { icon: "/brands/zai.svg", label: "Z.ai", color: "#5c6795" },
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
 system: { label: "Warden", color: "#5c6795" },
 "demo-script": { label: "Warden", color: "#5c6795" },
};

/** Display name for an event actor (`human:founder` → `User`, etc.). */
export function actorLabel(actor: string): string {
 if (actor.startsWith("human:")) {
 const n = actor.slice(6);
 return n && n !== "founder" ? n.charAt(0).toUpperCase() + n.slice(1) : "User";
 }
 if (actor.startsWith("system:")) {
 return actor.slice(7) === "auto-approve" ? "Autopilot" : "Warden";
 }
 // Panel members carry a "#n" suffix for uniqueness; strip it. A model id
 // ("lab/model") resolves to its model name; otherwise the actor is a brand key.
 const base = actor.split("#")[0];
 if (base.includes("/")) return labelForModelId(base);
 const key = base.toLowerCase().split(":")[0];
 return BRANDS[key]?.label ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** A brand logo for an actor, falling back to a coloured letter chip. */
export function Brand({ actor, size = 16 }: { actor: string; size?: number }) {
 const base = actor.split("#")[0];
 const baseKey = base.toLowerCase().split(":")[0];
 const [err, setErr] = useState(false);
 const label = actorLabel(actor);

 // Warden's own actions (the orchestrator / worker) carry our app icon, not a favicon.
 if (baseKey === "system" || baseKey === "demo-script") {
 return (
 // eslint-disable-next-line @next/next/no-img-element
 <img src="/icon.png" width={size} height={size} alt={label} className="rounded-[3px]" />
 );
 }

 // A human actor (the approver) gets a person glyph rather than a favicon or letter.
 if (baseKey === "human") {
 return (
 <span
 role="img"
 aria-label={label}
 className="grid shrink-0 place-items-center rounded-[3px]"
 style={{
 width: size,
 height: size,
 color: "#5c6795",
 background: "color-mix(in srgb, #5c6795 16%, transparent)",
 border: "1px solid color-mix(in srgb, #5c6795 35%, transparent)",
 }}
 >
 <Icon name="user" size={Math.round(size * 0.7)} />
 </span>
 );
 }

 // A model id resolves to its lab's brand; otherwise the actor is itself a brand key.
 const key = base.includes("/") ? brandKeyForModelId(base) : baseKey;
 const brand = BRANDS[key];
 const color = brand?.color ?? "#5c6795";
 // Prefer an explicit icon (for sites Google's favicon service can't resolve);
 // otherwise derive one from the brand domain.
 const iconSrc =
 brand?.icon ?? (brand?.domain ? `https://www.google.com/s2/favicons?domain=${brand.domain}&sz=64` : null);

 if (iconSrc && !err) {
 return (
 // eslint-disable-next-line @next/next/no-img-element
 <img
 src={iconSrc}
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
