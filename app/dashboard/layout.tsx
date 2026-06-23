import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Sidebar, MobileNav } from "@/app/_components/sidebar";

export const metadata: Metadata = {
 // Re-declare the template so nested sections (Settings, Metrics, ...) also
 // get the " | Warden" suffix; `default` titles the dashboard index itself.
 title: {
 default: "Incidents",
 template: "%s | Warden",
 },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
 return (
 <div className="flex">
 <Sidebar />
 <div className="min-w-0 flex-1">
 <MobileNav />
 <main>{children}</main>
 </div>
 </div>
 );
}
