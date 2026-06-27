import type { ReactNode } from "react";
import { Frame, Label, Button, ConnectionStatus } from "@/app/_components/console";
import { Icon } from "@/app/_components/icons";
import { Brand } from "@/app/_components/brand";

export function Section({
 icon,
 title,
 aside,
 onSave,
 busy,
 children,
}: {
 icon: string;
 title: string;
 aside?: string;
 onSave?: () => void;
 busy?: boolean;
 children: ReactNode;
}) {
 return (
 <Frame>
 <header className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-5 py-3">
 <div className="flex items-center gap-2.5">
 <span className="text-[var(--color-brand-2)]">
 <Icon name={icon} size={15} />
 </span>
 <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
 {aside && <Label className="ml-1">{aside}</Label>}
 </div>
 {onSave && (
 <Button onClick={onSave} disabled={busy} size="sm">
 {busy ? "Saving…" : "Save"}
 </Button>
 )}
 </header>
 <div className="space-y-3 px-5 py-4">{children}</div>
 </Frame>
 );
}

export function Row({
 label,
 hint,
 children,
}: {
 label: string;
 hint?: string;
 children: ReactNode;
}) {
 return (
 <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
 <div className="min-w-0 sm:flex-1">
 <div className="text-sm">{label}</div>
 {hint && <div className="mt-0.5 text-xs text-[var(--color-muted)]">{hint}</div>}
 </div>
 <div className="w-full shrink-0 sm:w-auto">{children}</div>
 </div>
 );
}

export function IntegrationRow({
 actor,
 name,
 connected,
}: {
 actor: string;
 name: string;
 connected: boolean;
}) {
 return (
 <div className="flex items-center gap-2.5">
 <Brand actor={actor} size={18} />
 <span className="text-sm font-medium">{name}</span>
 <span className="ml-auto">
 <ConnectionStatus connected={connected} />
 </span>
 </div>
 );
}

/** Native select with the browser chevron removed and a custom one centered, so
 * the text and arrow line up consistently across providers and browsers. */
export function Select({
 value,
 onChange,
 children,
 className = "",
}: {
 value: string;
 onChange: (v: string) => void;
 children: ReactNode;
 className?: string;
}) {
 return (
 <div className={`relative inline-block ${className}`}>
 <select
 value={value}
 onChange={(e) => onChange(e.target.value)}
 className="w-full appearance-none rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] py-2 pl-3 pr-9 font-mono text-xs text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
 >
 {children}
 </select>
 <svg
 viewBox="0 0 24 24"
 width="14"
 height="14"
 fill="none"
 stroke="currentColor"
 strokeWidth="2"
 aria-hidden
 className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
 >
 <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
 </svg>
 </div>
 );
}

/** The single input recipe. Stacked fields add their own `mt-1.5` over a label;
 * inline fields use it bare. One source of truth so inputs never drift. */
export const FIELD =
 "w-full rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2 font-mono text-xs text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]";

export function TextField({
 label,
 placeholder,
 value,
 onChange,
}: {
 label: string;
 placeholder?: string;
 value: string;
 onChange: (v: string) => void;
}) {
 return (
 <label className="block">
 <Label>{label}</Label>
 <input
 type="text"
 spellCheck={false}
 placeholder={placeholder}
 value={value}
 onChange={(e) => onChange(e.target.value)}
 className={`mt-1.5 ${FIELD}`}
 />
 </label>
 );
}

export function KeyField({
 label,
 placeholder,
 value,
 onChange,
 secret,
}: {
 label: string;
 placeholder?: string;
 value: string;
 onChange: (v: string) => void;
 /** A masked secret; when set, the placeholder shows •••• + last-4 automatically. */
 secret?: { set: boolean; hint: string };
}) {
 const ph = secret?.set ? `•••• ${secret.hint}` : placeholder;
 return (
 <label className="block">
 <Label>{label}</Label>
 <input
 type="password"
 autoComplete="off"
 spellCheck={false}
 placeholder={ph}
 value={value}
 onChange={(e) => onChange(e.target.value)}
 className={`mt-1.5 ${FIELD}`}
 />
 </label>
 );
}
