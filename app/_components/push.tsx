"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array {
 const padding = "=".repeat((4 - (base64.length % 4)) % 4);
 const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
 const raw = atob(b64);
 const out = new Uint8Array(raw.length);
 for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
 return out;
}

/**
 * "Enable notifications" toggle for the approval PWA. In simulation mode there's
 * no VAPID key configured, so it shows a disabled hint instead of failing.
 */
export function EnableNotifications() {
 const [publicKey, setPublicKey] = useState<string | null>(null);
 const [state, setState] = useState<"idle" | "on" | "working" | "unsupported">("idle");

 useEffect(() => {
 fetch("/api/push/subscribe")
 .then((r) => r.json())
 .then((d) => setPublicKey(d.publicKey ?? null))
 .catch(() => setPublicKey(null));
 }, []);

 async function enable() {
 if (!publicKey) return;
 // Push needs a secure context + the Notification/Push APIs. Distinguish
 // "unsupported" from "denied" so the user gets an actionable hint.
 if (
 !("serviceWorker" in navigator) ||
 !("Notification" in window) ||
 !("PushManager" in window) ||
 !window.isSecureContext
 ) {
 setState("unsupported");
 return;
 }
 setState("working");
 try {
 const reg = await navigator.serviceWorker.register("/sw.js");
 const permission = await Notification.requestPermission();
 if (permission !== "granted") return setState("idle");
 const sub = await reg.pushManager.subscribe({
 userVisibleOnly: true,
 applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
 });
 await fetch("/api/push/subscribe", {
 method: "POST",
 headers: { "content-type": "application/json" },
 body: JSON.stringify(sub.toJSON()),
 });
 setState("on");
 } catch {
 setState("idle");
 }
 }

 if (!publicKey) {
 return (
 <span className="text-[10px] text-[var(--color-muted)]" title="Set VAPID keys to enable push (see docs/operations/go-live.md)">
 push: demo mode
 </span>
 );
 }
 if (state === "unsupported") {
 return (
 <span
 className="text-[10px] text-[var(--color-muted)]"
 title="Push needs HTTPS and a supported browser"
 >
 push: unsupported here
 </span>
 );
 }
 return (
 <button
 onClick={enable}
 disabled={state !== "idle"}
 className="rounded-full border border-[var(--color-line)] px-3 py-1 text-[10px] text-[var(--color-muted)]"
 >
 {state === "on" ? "🔔 on" : state === "working" ? "…" : "Enable notifications"}
 </button>
 );
}
