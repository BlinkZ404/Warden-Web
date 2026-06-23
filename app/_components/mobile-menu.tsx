"use client";

import Link from "next/link";
import { useState } from "react";

type Item = { href: string; label: string; external?: boolean };

/* The mobile hamburger for the site headers: a toggle that drops a full-width
 panel of links below the header. Hidden on sm+, where the links sit inline. */
export function MobileMenu({ items }: { items: Item[] }) {
 const [open, setOpen] = useState(false);
 const close = () => setOpen(false);

 return (
 <div className="flex items-stretch sm:hidden">
 <button
 type="button"
 aria-label={open ? "Close menu" : "Open menu"}
 aria-expanded={open}
 onClick={() => setOpen((v) => !v)}
 className="flex items-center border-l border-[var(--color-line)] px-4 text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
 >
 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
 {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
 </svg>
 </button>

 {open && (
 <nav className="absolute left-0 right-0 top-full z-40 flex flex-col border-b border-[var(--color-line)] bg-[var(--color-panel)] shadow-[0_24px_48px_-16px_rgba(0,0,0,0.7)]">
 {items.map((item) =>
 item.external ? (
 <a
 key={item.href}
 href={item.href}
 onClick={close}
 className="border-t border-[var(--color-line)] px-6 py-3.5 text-sm font-medium text-[var(--color-text)] transition first:border-t-0 hover:bg-[color-mix(in_srgb,var(--color-panel-2)_70%,transparent)]"
 >
 {item.label}
 </a>
 ) : (
 <Link
 key={item.href}
 href={item.href}
 onClick={close}
 className="border-t border-[var(--color-line)] px-6 py-3.5 text-sm font-medium text-[var(--color-text)] transition first:border-t-0 hover:bg-[color-mix(in_srgb,var(--color-panel-2)_70%,transparent)]"
 >
 {item.label}
 </Link>
 ),
 )}
 </nav>
 )}
 </div>
 );
}
