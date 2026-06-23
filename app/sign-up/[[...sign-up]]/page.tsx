import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { AUTH_ENABLED } from "@/lib/auth";
import { CLERK_APPEARANCE } from "@/lib/clerk-appearance";
import { Wordmark } from "@/app/_components/wordmark";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign up" };

export default function Page() {
 if (!AUTH_ENABLED) redirect("/dashboard");
 return (
 <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[var(--color-ink)] p-6">
 <Wordmark className="h-5 w-auto" />
 <SignUp appearance={CLERK_APPEARANCE} />
 </main>
 );
}
