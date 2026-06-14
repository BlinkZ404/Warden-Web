import type { ReactNode } from "react";
import { Sidebar, MobileNav } from "@/app/_components/sidebar";

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
