import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { AUTH_ENABLED } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
 title: {
 default: "Warden",
 template: "%s | Warden",
 },
 description:
 "The on-call engineer you don't have. Catches production errors, fixes them, verifies the fix, and waits for your one-tap approval before anything ships.",
 manifest: "/manifest.webmanifest",
 applicationName: "Warden",
};

export const viewport: Viewport = {
 themeColor: "#0a0c10",
 width: "device-width",
 initialScale: 1,
 maximumScale: 1,
};

export default function RootLayout({
 children,
}: {
 children: React.ReactNode;
}) {
 const tree = (
 <html lang="en">
 <head>
 <script
 dangerouslySetInnerHTML={{
 __html:
 "try{if(localStorage.getItem('warden-theme')==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}",
 }}
 />
 </head>
 <body>{children}</body>
 </html>
 );

 // Only mount Clerk when it is configured, so the app still renders without keys.
 return AUTH_ENABLED ? (
 <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" signInFallbackRedirectUrl="/dashboard">
 {tree}
 </ClerkProvider>
 ) : (
 tree
 );
}
