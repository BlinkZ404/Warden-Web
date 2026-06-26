"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon } from "@/app/_components/icons";
import { ThemeToggle } from "@/app/_components/theme-toggle";
import { Wordmark } from "@/app/_components/wordmark";

function NavItem({
 href,
 icon,
 children,
 active = false,
 badge,
}: {
 href: string;
 icon: string;
 children: ReactNode;
 active?: boolean;
 badge?: ReactNode;
}) {
 return (
 <Link
 href={href}
 className={`flex items-center gap-3 px-5 py-2 text-sm transition ${
 active
 ? "bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-brand-2)] shadow-[inset_2px_0_0_var(--color-accent)]"
 : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
 }`}
 >
 <Icon name={icon} size={16} />
 <span className="uppercase tracking-wide">{children}</span>
 {badge != null && (
 <span className="ml-auto rounded border border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-line))] px-1.5 py-px font-mono text-[9px] tracking-wider text-[var(--color-brand-2)]">
 {badge}
 </span>
 )}
 </Link>
 );
}

function SecLabel({ children }: { children: ReactNode }) {
 return (
 <div className="px-5 pb-1.5 pt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
 {children}
 </div>
 );
}

const KNOWN = ["metrics", "audit", "security", "keys", "settings", "usage"];

function BrandMark() {
 return (
 <Link href="/" className="flex items-center border-b border-[var(--color-line)] px-5 py-4">
 <Wordmark className="h-4 w-auto" />
 </Link>
 );
}

/** The nav body; shared by the desktop sidebar and the mobile drawer. */
function SidebarContent({ live }: { live: boolean }) {
 const pathname = usePathname() ?? "";
 const seg = pathname.replace(/^\/dashboard\/?/, "").split("/")[0];
 const is = (s: string) => seg === s;
 // Incidents owns the index and every incident-detail route (an id segment),
 // i.e. anything under /dashboard that isn't one of the named sections.
 const onIncidents = pathname.startsWith("/dashboard") && !KNOWN.includes(seg);

 return (
 <>
 <BrandMark />

 <SecLabel>Monitor</SecLabel>
 <NavItem href="/dashboard" icon="activity" active={onIncidents}>
 Incidents
 </NavItem>
 <NavItem href="/dashboard/metrics" icon="gauge" active={is("metrics")}>
 Metrics
 </NavItem>
 <NavItem href="/dashboard/audit" icon="log" active={is("audit")}>
 Audit log
 </NavItem>
 {!live && (
 <NavItem href="/dashboard/security" icon="shieldCheck" active={is("security")}>
 Security
 </NavItem>
 )}

 <SecLabel>Configure</SecLabel>
 <NavItem href="/dashboard/keys" icon="key" active={is("keys")}>
 API Keys
 </NavItem>
 <NavItem href="/dashboard/settings" icon="gear" active={is("settings")}>
 Settings
 </NavItem>

 <SecLabel>Account</SecLabel>
 <NavItem href="/dashboard/usage" icon="coins" active={is("usage")}>
 Usage
 </NavItem>

 <div className="mt-auto">
 <div className="flex items-center justify-between border-t border-[var(--color-line)] px-5 py-3">
 <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
 Theme
 </span>
 <ThemeToggle />
 </div>
 <div className="flex items-center gap-2.5 border-t border-[var(--color-line)] px-5 py-3.5 text-xs text-[var(--color-muted)]">
 <span className="grid h-6 w-6 place-items-center rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] text-[var(--color-brand-2)]">
 <Icon name="robot" size={14} />
 </span>
 Guest Mode
 </div>
 </div>
 </>
 );
}

/** Desktop: a sticky full-height rail (hidden below lg). */
export function Sidebar({ live }: { live: boolean }) {
 return (
 <aside className="sticky top-0 hidden h-screen w-60 flex-none flex-col self-start overflow-y-auto border-r border-[var(--color-line)] lg:flex">
 <SidebarContent live={live} />
 </aside>
 );
}

/** Mobile: a top bar with a hamburger that opens the nav as a slide-in drawer. */
export function MobileNav({ live }: { live: boolean }) {
 const [open, setOpen] = useState(false);
 return (
 <div className="lg:hidden">
 <div className="flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-3">
 <button
 onClick={() => setOpen(true)}
 aria-label="Open navigation"
 className="grid h-8 w-8 place-items-center rounded-md border border-[var(--color-line)] text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
 >
 <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
 <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
 </svg>
 </button>
 <Link href="/" className="flex items-center gap-2">
 <Wordmark className="h-4 w-auto" />
 </Link>
 </div>

 {open && (
 <div className="fixed inset-0 z-50">
 <div
 className="absolute inset-0 bg-black/60"
 onClick={() => setOpen(false)}
 aria-hidden
 />
 {/* Closing on click bubbles up from any nav link tap. */}
 <aside
 onClick={() => setOpen(false)}
 className="absolute left-0 top-0 flex h-full w-64 flex-col overflow-y-auto border-r border-[var(--color-line)] bg-[var(--color-ink)]"
 >
 <SidebarContent live={live} />
 </aside>
 </div>
 )}
 </div>
 );
}
