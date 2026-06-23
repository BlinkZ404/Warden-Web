/* The Warden wordmark (white-on-transparent PNG). The .wd-logo rule in
 globals.css flips it dark under the light theme. Shared by the landing,
 docs, and dashboard headers so the brand mark lives in one place. */

export function Wordmark({ className = "h-[15px] w-auto" }: { className?: string }) {
 return (
 // eslint-disable-next-line @next/next/no-img-element
 <img
 src="/logo.png"
 alt="Warden"
 width={1560}
 height={149}
 className={`wd-logo select-none ${className}`}
 />
 );
}
