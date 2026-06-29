import Link from "next/link";
import BrandRobot from "./_components/brand-robot";
import { Wordmark } from "./_components/wordmark";
import { MobileMenu } from "./_components/mobile-menu";

/* The bottom strip: the infrastructure Warden is built on, and the pluggable
 model layer it runs the agents on. Monochrome brand marks so each row reads
 as one unit. */
type Provider = { name: string; Mark: (p: { className?: string }) => React.ReactElement };

const INFRA: Provider[] = [
 { name: "Amazon Aurora", Mark: AuroraMark },
 { name: "Vercel", Mark: VercelMark },
 { name: "Sentry", Mark: SentryMark },
];

// The Fixer / Investigator / Reviewer roles run on any OpenAI-compatible
// provider; these are the model families in the lib/models.ts catalog.
const MODELS: Provider[] = [
 { name: "Claude", Mark: ClaudeMark },
 { name: "OpenAI", Mark: OpenAIMark },
 { name: "Gemini", Mark: GeminiMark },
 { name: "Grok", Mark: GrokMark },
 { name: "DeepSeek", Mark: DeepSeekMark },
 { name: "Kimi", Mark: KimiMark },
 { name: "MiniMax", Mark: MiniMaxMark },
 { name: "Cursor", Mark: CursorMark },
 { name: "NVIDIA", Mark: NvidiaMark },
];

export default function Home() {
 return (
 <main className="relative flex min-h-screen flex-col overflow-x-hidden bg-[var(--color-ink)] lg:h-screen lg:min-h-[700px] lg:overflow-hidden">
 {/* ── atmosphere: vignette, dotted field, a faint giant wordmark ───────── */}
 <div aria-hidden className="pointer-events-none absolute inset-0">
 <div className="wd-vignette absolute inset-0" />
 <div className="wd-dots absolute inset-0 opacity-50" />
 <div className="wd-grain absolute inset-0 opacity-[0.05] mix-blend-screen" />
 <div className="absolute inset-x-0 bottom-[15%] flex justify-center">
 <span className="wd-outline whitespace-nowrap text-[20vw] font-black leading-none tracking-tighter">
 ON CALL
 </span>
 </div>
 </div>

 {/* ── top nav: full-bleed bottom rule, dashboard sits in a tinted cell ─── */}
 <header className="relative z-20 border-b border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-ink)_55%,transparent)] backdrop-blur-sm">
 <div className="mx-auto flex max-w-7xl items-stretch justify-between">
 <div className="flex items-center gap-2.5 px-6 py-4 sm:px-8">
 <Wordmark />
 </div>
 <div className="flex items-stretch">
 <Link
 href="/docs"
 className="hidden items-center gap-2 border-l border-[var(--color-line)] px-4 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[color-mix(in_srgb,var(--color-panel)_60%,transparent)] hover:text-[var(--color-text)] sm:flex"
 >
 <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
 <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H18a1 1 0 0 1 1 1v15H6a2 2 0 0 1-2-2z" />
 <path d="M8 8h7M8 11.5h7" />
 </svg>
 Docs
 </Link>
 <a
 href="https://github.com/BlinkZ404/Warden-Web"
 className="hidden items-center gap-2 border-l border-[var(--color-line)] px-4 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[color-mix(in_srgb,var(--color-panel)_60%,transparent)] hover:text-[var(--color-text)] sm:flex"
 >
 <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
 <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
 </svg>
 GitHub
 </a>
 <MobileMenu
 items={[
 { href: "/docs", label: "Docs" },
 { href: "https://github.com/BlinkZ404/Warden-Web", label: "GitHub", external: true },
 ]}
 />
 <Link
 href="/dashboard"
 className="group flex items-center gap-2 border-l border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-brand)_15%,transparent)] px-5 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[color-mix(in_srgb,var(--color-brand)_26%,transparent)]"
 >
 Try Warden
 <span aria-hidden className="text-[var(--color-brand-2)] transition group-hover:translate-x-0.5">
 →
 </span>
 </Link>
 </div>
 </div>
 </header>

 {/* ── hero: copy on the left, the robot standing watch on the right ─────── */}
 <div className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 lg:grid-cols-12">
 <PlusTick className="left-0 top-0 -translate-x-1/2 -translate-y-1/2" />
 <PlusTick className="right-0 top-0 translate-x-1/2 -translate-y-1/2" />
 <PlusTick className="bottom-0 left-0 -translate-x-1/2 translate-y-1/2" />
 <PlusTick className="bottom-0 right-0 translate-x-1/2 translate-y-1/2" />

 {/* left: hero copy */}
 <div className="relative flex flex-col justify-center px-6 py-10 sm:px-8 lg:col-span-7 lg:pr-12">
 <span className="inline-flex w-fit items-center gap-2 rounded-md border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_60%,transparent)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--color-brand-2)] backdrop-blur-sm">
 <span className="inline-block h-1 w-1 rounded-full bg-[var(--color-spark)] shadow-[0_0_6px_var(--color-spark)]" />
 Autonomous on-call engineer
 </span>

 <h1 className="mt-6 text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.5rem]">
 <span className="block text-[var(--color-text)]">The on-call engineer</span>
 <span className="block bg-gradient-to-r from-[var(--color-brand-2)] via-[var(--color-spark)] to-[var(--color-brand-2)] bg-clip-text text-transparent">
 you don&apos;t have.
 </span>
 </h1>

 <p className="mt-5 max-w-xl text-base text-[var(--color-muted)] sm:text-lg">
 Warden catches a production crash, writes the fix, proves it on a live
 preview, and waits for your one tap. You sleep. It ships.
 </p>

 <div className="mt-8 flex flex-wrap items-center gap-3">
 <Link
 href="/dashboard"
 className="wd-cta inline-flex items-center gap-2 rounded-md bg-[var(--color-brand)] px-6 py-3 text-sm font-semibold text-white"
 >
 Open dashboard
 <span aria-hidden>→</span>
 </Link>
 <Link
 href="/dashboard"
 className="wd-ghost inline-flex items-center gap-2 rounded-md border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_50%,transparent)] px-6 py-3 text-sm font-medium text-[var(--color-text)] backdrop-blur-sm"
 >
 <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
 <path d="M5 3.5v9l7-4.5z" />
 </svg>
 Watch it ship a fix
 </Link>
 </div>
 </div>

 {/* right: the robot, standing watch */}
 <div className="relative flex items-center justify-center px-6 pb-8 pt-2 lg:col-span-5 lg:py-10">
 <div className="relative flex w-full max-w-[420px] items-center justify-center">
 <div
 className="wd-aura absolute left-1/2 top-1/2 h-[230px] w-[230px] rounded-full sm:h-[300px] sm:w-[300px] lg:h-[330px] lg:w-[330px]"
 style={{
 background:
 "radial-gradient(closest-side, color-mix(in srgb, var(--color-brand) 50%, transparent), transparent 70%)",
 }}
 />
 <BrandRobot className="relative z-10 h-[270px] w-auto sm:h-[360px] lg:h-[440px]" />
 </div>
 </div>
 </div>

 {/* ── bottom strip: what it's built on, and the models it runs ───────── */}
 <div className="relative z-10 border-t border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-ink)_55%,transparent)] backdrop-blur-sm">
 <div className="mx-auto max-w-7xl divide-y divide-[var(--color-line)]">
 <StripRow label="Built on" providers={INFRA} />
 <StripRow label="Any model" providers={MODELS} iconOnly more="+ Many" />
 </div>
 </div>
 </main>
 );
}

/* A blueprint tick that marks the corners of the hero frame. The caller passes
 the corner position and matching translate so each plus centers on its corner. */
function PlusTick({ className = "" }: { className?: string }) {
 return (
 <span
 aria-hidden
 className={`pointer-events-none absolute z-10 text-[var(--color-line)] ${className}`}
 >
 <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
 <path d="M6.5 1v11M1 6.5h11" />
 </svg>
 </span>
 );
}

/* One row of the bottom strip: a leading label (hidden on small screens) and a
 set of evenly-spaced brand cells. `iconOnly` drops the visible names and shows
 each on hover instead; `more` adds a trailing link to the docs. */
function StripRow({
 label,
 providers,
 iconOnly,
 more,
}: {
 label: string;
 providers: Provider[];
 iconOnly?: boolean;
 more?: string;
}) {
 return (
 <div className="flex items-stretch">
 <div className="hidden w-[132px] shrink-0 items-center border-r border-[var(--color-line)] px-5 sm:flex">
 <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
 {label}
 </span>
 </div>
 <div className="flex flex-1 items-stretch">
 {providers.map(({ name, Mark }) => (
 <div
 key={name}
 className="group relative flex flex-1 items-center justify-center gap-1.5 border-l border-[var(--color-line)] px-1.5 py-3.5 first:border-l-0 sm:gap-2.5 sm:px-2"
 >
 <Mark className="h-5 w-5 shrink-0 text-[var(--color-brand-2)]" />
 {iconOnly ? (
 <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-[11px] font-medium text-[var(--color-text)] opacity-0 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.85)] transition-opacity duration-150 group-hover:opacity-100">
 {name}
 </span>
 ) : (
 <span className="text-xs font-medium text-[var(--color-text)] sm:text-sm">{name}</span>
 )}
 </div>
 ))}
 {more && (
 <Link
 href="/docs"
 className="flex shrink-0 items-center justify-center whitespace-nowrap border-l border-[var(--color-line)] px-4 text-xs font-medium text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
 >
 {more}
 </Link>
 )}
 </div>
 </div>
 );
}

/* ── brand marks (official paths, rendered monochrome) ────────────────────── */

/* Amazon Aurora has no standalone monochrome icon, so the AWS logo stands in. */
function AuroraMark({ className = "" }: { className?: string }) {
 return (
 <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
 <path d="M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 0 1-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 0 1-.287-.375 6.18 6.18 0 0 1-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.03-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.295.072-.583.16-.862.272a2.287 2.287 0 0 1-.28.104.488.488 0 0 1-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 0 1 .224-.167c.279-.144.614-.264 1.005-.36a4.84 4.84 0 0 1 1.246-.151c.95 0 1.644.216 2.091.647.439.43.662 1.085.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.152.224-.32.272-.512.047-.191.08-.423.08-.694v-.335a6.66 6.66 0 0 0-.735-.136 6.02 6.02 0 0 0-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 0 1-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 0 1 .32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 0 1-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.223a.563.563 0 0 1-.048-.224v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758.777.777 0 0 0-.215-.559c-.144-.151-.416-.287-.807-.415l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.902 1.902 0 0 1-.4-1.158c0-.335.073-.63.216-.886.144-.255.335-.479.575-.654.24-.184.51-.32.83-.415.32-.096.655-.136 1.006-.136.175 0 .359.008.535.032.183.024.35.056.518.088.16.04.312.08.455.127.144.048.256.096.336.144a.69.69 0 0 1 .24.2.43.43 0 0 1 .071.263v.375c0 .168-.064.256-.184.256a.83.83 0 0 1-.303-.096 3.652 3.652 0 0 0-1.532-.311c-.455 0-.815.071-1.062.223-.248.152-.375.383-.375.71 0 .224.08.416.24.567.159.152.454.304.877.44l1.134.358c.574.184.99.44 1.237.767.247.327.367.702.367 1.117 0 .343-.072.655-.207.926-.144.272-.336.511-.583.703-.248.2-.543.343-.886.447-.36.111-.734.167-1.142.167zM21.698 16.207c-2.626 1.94-6.442 2.969-9.722 2.969-4.598 0-8.74-1.7-11.87-4.526-.247-.223-.024-.527.272-.351 3.384 1.963 7.559 3.153 11.877 3.153 2.914 0 6.114-.607 9.06-1.852.439-.2.814.287.383.607zM22.792 14.961c-.336-.43-2.22-.207-3.074-.103-.255.032-.295-.192-.063-.36 1.5-1.053 3.967-.75 4.254-.399.287.36-.08 2.826-1.485 4.007-.215.184-.423.088-.327-.151.32-.79 1.03-2.57.695-2.994z" />
 </svg>
 );
}

function VercelMark({ className = "" }: { className?: string }) {
 return (
 <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
 <path d="m12 1.608 12 20.784H0Z" />
 </svg>
 );
}

function SentryMark({ className = "" }: { className?: string }) {
 return (
 <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
 <path d="M13.91 2.505c-.873-1.448-2.972-1.448-3.844 0L6.904 7.92a15.478 15.478 0 0 1 8.53 12.811h-2.221A13.301 13.301 0 0 0 5.784 9.814l-2.926 5.06a7.65 7.65 0 0 1 4.435 5.848H2.194a.365.365 0 0 1-.298-.534l1.413-2.402a5.16 5.16 0 0 0-1.614-.913L.296 19.275a2.182 2.182 0 0 0 .812 2.999 2.24 2.24 0 0 0 1.086.288h6.983a9.322 9.322 0 0 0-3.845-8.318l1.11-1.922a11.47 11.47 0 0 1 4.95 10.24h5.915a17.242 17.242 0 0 0-7.885-15.28l2.244-3.845a.37.37 0 0 1 .504-.13c.255.14 9.75 16.708 9.928 16.9a.365.365 0 0 1-.327.543h-2.287c.029.612.029 1.223 0 1.831h2.297a2.206 2.206 0 0 0 1.922-3.31z" />
 </svg>
 );
}

function ClaudeMark({ className = "" }: { className?: string }) {
 return (
 <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
 <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
 </svg>
 );
}

function OpenAIMark({ className = "" }: { className?: string }) {
 return (
 <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
 <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
 </svg>
 );
}

function GeminiMark({ className = "" }: { className?: string }) {
 return (
 <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
 <path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" />
 </svg>
 );
}

function DeepSeekMark({ className = "" }: { className?: string }) {
 return (
 <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
 <path d="M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45" />
 </svg>
 );
}

/* Grok runs on xAI; the X mark is its brand. */
function GrokMark({ className = "" }: { className?: string }) {
 return (
 <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
 <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />
 </svg>
 );
}

/* Kimi is Moonshot AI. */
function KimiMark({ className = "" }: { className?: string }) {
 return (
 <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
 <path d="m1.053 16.91 9.538 2.55a21 20.981 0 0 0 .06 2.031l5.956 1.592a12 11.99 0 0 1-15.554-6.172m-1.02-5.79 11.352 3.035a21 20.981 0 0 0-.469 2.01l10.817 2.89a12 11.99 0 0 1-1.845 2.004L.658 15.918a12 11.99 0 0 1-.625-4.796m1.593-5.146L13.573 9.17a21 20.981 0 0 0-1.01 1.874l11.297 3.02a21 20.981 0 0 1-.67 2.362l-11.55-3.087L.125 10.26a12 11.99 0 0 1 1.499-4.285ZM6.067 1.58l11.285 3.016a21 20.981 0 0 0-1.688 1.719l7.824 2.091a21 20.981 0 0 1 .513 2.664L2.107 5.218a12 11.99 0 0 1 3.96-3.638M21.68 4.866 7.222 1.003A12 11.99 0 0 1 21.68 4.866" />
 </svg>
 );
}

function MiniMaxMark({ className = "" }: { className?: string }) {
 return (
 <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
 <path d="M11.43 3.92a.86.86 0 1 0-1.718 0v14.236a1.999 1.999 0 0 1-3.997 0V9.022a.86.86 0 1 0-1.718 0v3.87a1.999 1.999 0 0 1-3.997 0V11.49a.57.57 0 0 1 1.139 0v1.404a.86.86 0 0 0 1.719 0V9.022a1.999 1.999 0 0 1 3.997 0v9.134a.86.86 0 0 0 1.719 0V3.92a1.998 1.998 0 1 1 3.996 0v11.788a.57.57 0 1 1-1.139 0zm10.572 3.105a2 2 0 0 0-1.999 1.997v7.63a.86.86 0 0 1-1.718 0V3.923a1.999 1.999 0 0 0-3.997 0v16.16a.86.86 0 0 1-1.719 0V18.08a.57.57 0 1 0-1.138 0v2a1.998 1.998 0 0 0 3.996 0V3.92a.86.86 0 0 1 1.719 0v12.73a1.999 1.999 0 0 0 3.996 0V9.023a.86.86 0 1 1 1.72 0v6.686a.57.57 0 0 0 1.138 0V9.022a2 2 0 0 0-1.998-1.997" />
 </svg>
 );
}

function CursorMark({ className = "" }: { className?: string }) {
 return (
 <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
 <path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" />
 </svg>
 );
}

function NvidiaMark({ className = "" }: { className?: string }) {
 return (
 <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
 <path d="M8.948 8.798v-1.43a6.7 6.7 0 0 1 .424-.018c3.922-.124 6.493 3.374 6.493 3.374s-2.774 3.851-5.75 3.851c-.398 0-.787-.062-1.158-.185v-4.346c1.528.185 1.837.857 2.747 2.385l2.04-1.714s-1.492-1.952-4-1.952a6.016 6.016 0 0 0-.796.035m0-4.735v2.138l.424-.027c5.45-.185 9.01 4.47 9.01 4.47s-4.08 4.964-8.33 4.964c-.37 0-.733-.035-1.095-.097v1.325c.3.035.61.062.91.062 3.957 0 6.82-2.023 9.593-4.408.459.371 2.34 1.263 2.73 1.652-2.633 2.208-8.772 3.984-12.253 3.984-.335 0-.653-.018-.971-.053v1.864H24V4.063zm0 10.326v1.131c-3.657-.654-4.673-4.46-4.673-4.46s1.758-1.944 4.673-2.262v1.237H8.94c-1.528-.186-2.73 1.245-2.73 1.245s.68 2.412 2.739 3.11M2.456 10.9s2.164-3.197 6.5-3.533V6.201C4.153 6.59 0 10.653 0 10.653s2.35 6.802 8.948 7.42v-1.237c-4.84-.6-6.492-5.936-6.492-5.936z" />
 </svg>
 );
}
