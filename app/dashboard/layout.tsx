import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Sidebar, MobileNav } from "@/app/_components/sidebar";
import { hydrateSettings, isLiveRuntime } from "@/lib/runtime-config";

// The sidebar shows a run-mode-dependent item (the simulation-only Security
// lane), so this layout must reflect the current saved mode rather than a cached
// render. Force dynamic so it re-hydrates settings on every request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
 // Re-declare the template so nested sections (Settings, Metrics, ...) also
 // get the " | Warden" suffix; `default` titles the dashboard index itself.
 title: {
 default: "Incidents",
 template: "%s | Warden",
 },
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
 // The posture-scan ("Security") lane is simulation-only, so hide it in live mode.
 await hydrateSettings();
 const live = isLiveRuntime();
 return (
 <div className="flex">
 <Sidebar live={live} />
 <div className="min-w-0 flex-1">
 <MobileNav live={live} />
 <main>{children}</main>
 </div>
 </div>
 );
}
