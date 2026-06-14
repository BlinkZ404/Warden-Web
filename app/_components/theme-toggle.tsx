"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

export function ThemeToggle() {
 const [theme, setTheme] = useState<Theme>("dark");

 useEffect(() => {
 let saved: string | null = null;
 try {
 saved = localStorage.getItem("warden-theme");
 } catch {
 /* storage unavailable */
 }
 setTheme(saved === "light" ? "light" : "dark");
 }, []);

 function apply(t: Theme) {
 setTheme(t);
 document.documentElement.setAttribute("data-theme", t);
 try {
 localStorage.setItem("warden-theme", t);
 } catch {
 /* storage unavailable */
 }
 }

 return (
 <div className="inline-flex rounded-md border border-[var(--color-line)] p-0.5">
 {(["dark", "light"] as Theme[]).map((t) => (
 <button
 key={t}
 onClick={() => apply(t)}
 className={`rounded px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition ${
 theme === t
 ? "bg-[var(--color-accent)] text-white"
 : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
 }`}
 >
 {t}
 </button>
 ))}
 </div>
 );
}
