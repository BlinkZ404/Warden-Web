"use client";

import { useState } from "react";

/** Copy a value to the clipboard with a transient confirmation. */
export function CopyButton({ value, className = "" }: { value: string; className?: string }) {
 const [copied, setCopied] = useState(false);
 async function copy() {
 try {
 await navigator.clipboard.writeText(value);
 setCopied(true);
 setTimeout(() => setCopied(false), 1200);
 } catch {
 /* clipboard unavailable (insecure context); no-op */
 }
 }
 return (
 <button
 type="button"
 onClick={copy}
 aria-label={copied ? "Copied" : "Copy to clipboard"}
 className={`shrink-0 font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted)] transition hover:text-[var(--color-text)] ${className}`}
 >
 {copied ? "✓ copied" : "copy"}
 </button>
 );
}
