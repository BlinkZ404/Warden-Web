import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
 title: "Warden",
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
 return (
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
}
