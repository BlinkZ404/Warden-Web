import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
 return {
 name: "Warden",
 short_name: "Warden",
 description: "One-tap approval for production fixes.",
 start_url: "/dashboard",
 display: "standalone",
 background_color: "#080a0f",
 theme_color: "#080a0f",
 icons: [
 // Chromium requires both 192 and 512 for installability, plus a maskable.
 { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
 { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
 { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
 ],
 };
}
