"use client";

import { useEffect, useRef } from "react";

/**
 * The hero robot: inline SVG with eyes that track the pointer, plus an ambient
 * float, blink, and a pulsing core. The eye tracking needs the pointer position,
 * so this renders on the client; everything else is plain SVG + CSS.
 */
export default function BrandRobot({ className = "" }: { className?: string }) {
 const wrap = useRef<HTMLDivElement>(null);
 const eyes = useRef<SVGGElement>(null);

 useEffect(() => {
 const target = { x: 0, y: 0 };
 const cur = { x: 0, y: 0 };
 let raf = 0;

 function onMove(e: MouseEvent) {
 const el = wrap.current;
 if (!el) return;
 const r = el.getBoundingClientRect();
 const originX = r.left + r.width / 2;
 const originY = r.top + r.height * 0.4; // eyes sit in the upper third
 const nx = (e.clientX - originX) / (window.innerWidth / 2);
 const ny = (e.clientY - originY) / (window.innerHeight / 2);
 target.x = Math.max(-1, Math.min(1, nx)) * 13;
 target.y = Math.max(-1, Math.min(1, ny)) * 8;
 }

 function tick() {
 cur.x += (target.x - cur.x) * 0.12;
 cur.y += (target.y - cur.y) * 0.12;
 eyes.current?.setAttribute(
 "transform",
 `translate(${cur.x.toFixed(2)} ${cur.y.toFixed(2)})`);
 raf = requestAnimationFrame(tick);
 }

 raf = requestAnimationFrame(tick);
 window.addEventListener("mousemove", onMove);
 return () => {
 cancelAnimationFrame(raf);
 window.removeEventListener("mousemove", onMove);
 };
 }, []);

 return (
 <div ref={wrap} className={`flex items-center justify-center ${className}`}>
 <svg
 viewBox="0 0 280 380"
 className="robo-bob h-full max-h-[460px] w-auto"
 fill="none"
 role="img"
 aria-label="The Warden robot, standing watch"
 >
 <defs>
 <linearGradient id="robo-head" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0" stopColor="#241f44" />
 <stop offset="1" stopColor="#0d0b1a" />
 </linearGradient>
 <linearGradient id="robo-body" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0" stopColor="#6571a6" />
 <stop offset="1" stopColor="#3a4268" />
 </linearGradient>
 <linearGradient id="robo-neck" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0" stopColor="#2a2f49" />
 <stop offset="1" stopColor="#15182a" />
 </linearGradient>
 <radialGradient id="robo-cyan" cx="0.4" cy="0.35" r="0.8">
 <stop offset="0" stopColor="#e6feff" />
 <stop offset="1" stopColor="#57d6ea" />
 </radialGradient>
 <radialGradient id="robo-ground" cx="0.5" cy="0.5" r="0.5">
 <stop offset="0" stopColor="#5c6795" stopOpacity="0.5" />
 <stop offset="1" stopColor="#5c6795" stopOpacity="0" />
 </radialGradient>
 </defs>

 <ellipse cx="140" cy="350" rx="88" ry="16" fill="url(#robo-ground)" />

 {/* body */}
 <rect x="74" y="232" width="18" height="40" rx="9" fill="#3a4268" />
 <rect x="188" y="232" width="18" height="40" rx="9" fill="#3a4268" />
 <rect x="86" y="214" width="108" height="112" rx="32" fill="url(#robo-body)" />
 <rect x="100" y="222" width="80" height="14" rx="7" fill="#ffffff" opacity="0.07" />
 <circle cx="140" cy="266" r="17" fill="#0d0b1a" />
 <circle className="robo-core" cx="140" cy="266" r="10" fill="url(#robo-cyan)" />
 <circle cx="140" cy="266" r="3.5" fill="#ffffff" opacity="0.85" />
 <path d="M110 302 H170" stroke="#2c3354" strokeWidth="2" strokeLinecap="round" />

 {/* neck */}
 <rect x="120" y="198" width="40" height="22" rx="8" fill="url(#robo-neck)" />
 <ellipse cx="140" cy="219" rx="22" ry="5" fill="#1a1d2e" />

 {/* head */}
 <rect x="56" y="134" width="12" height="30" rx="6" fill="#1b1838" />
 <rect x="212" y="134" width="12" height="30" rx="6" fill="#1b1838" />
 <rect x="64" y="90" width="152" height="110" rx="34" fill="url(#robo-head)" stroke="#3a3566" strokeWidth="1.5" />
 <rect x="80" y="98" width="120" height="26" rx="13" fill="#ffffff" opacity="0.07" />
 <rect x="80" y="116" width="120" height="66" rx="20" fill="#07060f" />

 <g className="robo-blink">
 <g ref={eyes}>
 <circle cx="110" cy="150" r="16" fill="#7fe3ef" opacity="0.22" />
 <circle cx="170" cy="150" r="16" fill="#7fe3ef" opacity="0.22" />
 <circle cx="110" cy="150" r="11" fill="url(#robo-cyan)" />
 <circle cx="170" cy="150" r="11" fill="url(#robo-cyan)" />
 <circle cx="106" cy="146" r="3.5" fill="#ffffff" />
 <circle cx="166" cy="146" r="3.5" fill="#ffffff" />
 </g>
 </g>

 {/* antenna */}
 <line x1="140" y1="90" x2="140" y2="66" stroke="#3a4163" strokeWidth="3" strokeLinecap="round" />
 <circle className="robo-antenna" cx="140" cy="60" r="6" fill="#7fe3ef" />
 </svg>

 <style>{`
 @keyframes robo-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
 @keyframes robo-blink { 0%,90%,100% { transform: scaleY(1) } 95% { transform: scaleY(0.12) } }
 @keyframes robo-core {
 0%,100% { opacity: 0.7; filter: drop-shadow(0 0 3px #7fe3ef) }
 50% { opacity: 1; filter: drop-shadow(0 0 12px #7fe3ef) }
 }
 @keyframes robo-pulse {
 0%,100% { opacity: 0.55; filter: drop-shadow(0 0 2px #7fe3ef) }
 50% { opacity: 1; filter: drop-shadow(0 0 9px #7fe3ef) }
 }
 .robo-bob { animation: robo-float 4.5s ease-in-out infinite; will-change: transform }
 .robo-blink { animation: robo-blink 5.5s ease-in-out infinite; transform-box: fill-box; transform-origin: center }
 .robo-core { animation: robo-core 2.6s ease-in-out infinite }
 .robo-antenna { animation: robo-pulse 2s ease-in-out infinite }
 @media (prefers-reduced-motion: reduce) {
 .robo-bob, .robo-blink, .robo-core, .robo-antenna { animation: none }
 }
 `}</style>
 </div>
 );
}
