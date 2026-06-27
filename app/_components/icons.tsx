import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
 search: (
 <>
 <circle cx="11" cy="11" r="6" />
 <path d="M16 16l4 4" />
 </>
 ),
 code: <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />,
 key: (
 <>
 <circle cx="8" cy="16" r="4.5" />
 <path d="M11 13l9-9M17 7l3 3M19 5l2 2" />
 </>
 ),
 eye: (
 <>
 <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
 <circle cx="12" cy="12" r="2.6" />
 </>
 ),
 shieldCheck: (
 <>
 <path d="M12 3l7 3v5c0 4.4-3 7-7 8-4-1-7-3.6-7-8V6z" />
 <path d="M9 12l2 2 4-4" />
 </>
 ),
 deploy: <path d="M5 16l4-9h6l4 9M4 16h16v3.5H4z" />,
 flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
 activity: <path d="M3 13h4l2 5 4-12 2 7h6" />,
 chart: <path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-8" />,
 log: <path d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h5" />,
 gear: (
 <>
 <circle cx="12" cy="12" r="3.2" />
 <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8" />
 </>
 ),
 shield: <path d="M12 3l7 3v5c0 4.4-3 7-7 8-4-1-7-3.6-7-8V6z" />,
 users: (
 <>
 <circle cx="9" cy="8" r="3" />
 <path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
 <path d="M16 5.5a3 3 0 0 1 0 5.8M20.5 20c0-2.4-1.6-4-3.5-4.6" />
 </>
 ),
 user: (
 <>
 <circle cx="12" cy="8" r="3.5" />
 <path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
 </>
 ),
 plus: <path d="M12 5v14M5 12h14" />,
 gauge: (
 <>
 <path d="M4 19a8 8 0 1 1 16 0" />
 <path d="M12 19l4-5" />
 </>
 ),
 coins: (
 <>
 <ellipse cx="9" cy="7" rx="5.5" ry="2.5" />
 <path d="M3.5 7v5c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7" />
 <path d="M9 17c.4 1.3 2.7 2.3 5.5 2.3 3 0 5.5-1.1 5.5-2.5v-5c0-1.1-1.6-2-4-2.4" />
 </>
 ),
 robot: (
 <>
 <path d="M12 4v2.4" />
 <circle cx="12" cy="3.1" r="1" fill="currentColor" stroke="none" />
 <rect x="5" y="7" width="14" height="12" rx="3" />
 <path d="M5 11.5H3.3M19 11.5h1.7" />
 <circle cx="9.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
 <circle cx="14.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
 <path d="M9.5 15.5h5" />
 </>
 ),
};

export function Icon({
 name,
 size = 16,
 className = "",
}: {
 name: keyof typeof PATHS | string;
 size?: number;
 className?: string;
}) {
 return (
 <svg
 width={size}
 height={size}
 viewBox="0 0 24 24"
 fill="none"
 stroke="currentColor"
 strokeWidth="1.7"
 strokeLinecap="round"
 strokeLinejoin="round"
 className={className}
 aria-hidden
 >
 {PATHS[name as string] ?? null}
 </svg>
 );
}
