"use client";

import {
 Children,
 isValidElement,
 useEffect,
 useId,
 useRef,
 useState,
 type ReactNode,
 type ReactElement,
} from "react";
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

/** A custom dropdown that matches the box theme; the native <select> popup can't
 * be styled. Keeps the <option>-children API and parses them into the menu, so
 * call sites don't change. */
export function Select({
 value,
 onChange,
 children,
 className = "",
 "aria-label": ariaLabel,
}: {
 value: string;
 onChange: (v: string) => void;
 children: ReactNode;
 className?: string;
 "aria-label"?: string;
}) {
 const [open, setOpen] = useState(false);
 const [active, setActive] = useState(0);
 const ref = useRef<HTMLDivElement>(null);
 const baseId = useId();

 const options = Children.toArray(children)
 .filter(isValidElement)
 .map((c) => {
 const el = c as ReactElement<{ value?: string | number; children?: ReactNode }>;
 return { value: String(el.props.value ?? ""), label: el.props.children };
 });
 const currentIndex = options.findIndex((o) => o.value === value);
 const current = options[currentIndex];

 useEffect(() => {
 if (!open) return;
 function onDoc(e: MouseEvent) {
 if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
 }
 document.addEventListener("mousedown", onDoc);
 return () => document.removeEventListener("mousedown", onDoc);
 }, [open]);

 // Keep the keyboard-highlighted option scrolled into view in a long menu.
 useEffect(() => {
 if (open) document.getElementById(`${baseId}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
 }, [active, open, baseId]);

 function openMenu() {
 setActive(currentIndex >= 0 ? currentIndex : 0);
 setOpen(true);
 }
 function commit(i: number) {
 const o = options[i];
 if (o) onChange(o.value);
 setOpen(false);
 }

 return (
 <div ref={ref} className={`relative inline-block ${className}`}>
 <button
 type="button"
 role="combobox"
 aria-haspopup="listbox"
 aria-expanded={open}
 aria-controls={open ? `${baseId}-listbox` : undefined}
 aria-label={ariaLabel}
 aria-activedescendant={open ? `${baseId}-opt-${active}` : undefined}
 onClick={() => (open ? setOpen(false) : openMenu())}
 onBlur={(e) => {
 if (e.relatedTarget && !ref.current?.contains(e.relatedTarget as Node)) setOpen(false);
 }}
 onKeyDown={(e) => {
 switch (e.key) {
 case "ArrowDown":
 e.preventDefault();
 if (!open) openMenu();
 else setActive((a) => Math.min(options.length - 1, a + 1));
 break;
 case "ArrowUp":
 e.preventDefault();
 if (!open) openMenu();
 else setActive((a) => Math.max(0, a - 1));
 break;
 case "Home":
 if (open) {
 e.preventDefault();
 setActive(0);
 }
 break;
 case "End":
 if (open) {
 e.preventDefault();
 setActive(options.length - 1);
 }
 break;
 case "Enter":
 case " ":
 e.preventDefault();
 if (open) commit(active);
 else openMenu();
 break;
 case "Escape":
 setOpen(false);
 break;
 }
 }}
 className="flex w-full items-center justify-between gap-2 border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2 font-mono text-xs text-[var(--color-text)] outline-none transition hover:border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-line))] focus:border-[var(--color-accent)]"
 >
 <span className="truncate">{current?.label ?? ""}</span>
 <svg
 viewBox="0 0 24 24"
 width="14"
 height="14"
 fill="none"
 stroke="currentColor"
 strokeWidth="2"
 aria-hidden
 className={`shrink-0 text-[var(--color-muted)] transition-transform ${open ? "rotate-180" : ""}`}
 >
 <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
 </svg>
 </button>
 {open && (
 <div
 id={`${baseId}-listbox`}
 role="listbox"
 aria-label={ariaLabel}
 className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto border border-[var(--color-line)] bg-[var(--color-panel)] shadow-lg"
 >
 {options.map((o, i) => (
 <div
 key={o.value}
 id={`${baseId}-opt-${i}`}
 role="option"
 aria-selected={o.value === value}
 onMouseEnter={() => setActive(i)}
 onClick={() => commit(i)}
 className={`cursor-pointer px-3 py-2 font-mono text-xs transition ${
 i === active ? "bg-[color-mix(in_srgb,var(--color-accent)_16%,transparent)]" : ""
 } ${o.value === value ? "text-[var(--color-brand-2)]" : "text-[var(--color-text)]"}`}
 >
 {o.label}
 </div>
 ))}
 </div>
 )}
 </div>
 );
}

/** The single input recipe. Stacked fields add their own `mt-1.5` over a label;
 * inline fields use it bare. One source of truth so inputs never drift. */
export const FIELD =
 "w-full border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2 font-mono text-xs text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]";

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
