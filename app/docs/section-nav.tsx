"use client";

import { useEffect, useState } from "react";

type Item = { id: string; label: string };

/**
 * The docs "On this page" nav. Tracks which section is in view with an
 * IntersectionObserver and highlights the matching link as you scroll.
 */
export function SectionNav({ items }: { items: Item[] }) {
 const [active, setActive] = useState(items[0]?.id ?? "");

 useEffect(() => {
 const sections = items
 .map((i) => document.getElementById(i.id))
 .filter((el): el is HTMLElement => el !== null);
 if (sections.length === 0) return;

 const observer = new IntersectionObserver(
 (entries) => {
 // Among the sections crossing the active band, the topmost one wins.
 const visible = entries
 .filter((e) => e.isIntersecting)
 .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
 if (visible.length > 0) setActive(visible[0].target.id);
 },
 // Active band sits just under the sticky header, in the upper third.
 { rootMargin: "-96px 0px -65% 0px", threshold: 0 },
 );

 sections.forEach((s) => observer.observe(s));
 return () => observer.disconnect();
 }, [items]);

 return (
 <nav className="sticky top-[57px] px-6 py-10">
 <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-muted)]">
 On this page
 </p>
 <ul className="space-y-0.5">
 {items.map((n) => {
 const isActive = active === n.id;
 return (
 <li key={n.id}>
 <a
 href={`#${n.id}`}
 aria-current={isActive ? "true" : undefined}
 className={`block border-l-2 px-3 py-1.5 text-sm transition ${
 isActive
 ? "border-[var(--color-brand)] bg-[color-mix(in_srgb,var(--color-brand)_12%,transparent)] font-medium text-[var(--color-text)]"
 : "border-transparent text-[var(--color-muted)] hover:border-[var(--color-line)] hover:text-[var(--color-text)]"
 }`}
 >
 {n.label}
 </a>
 </li>
 );
 })}
 </ul>
 </nav>
 );
}
