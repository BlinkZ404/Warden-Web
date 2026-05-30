import type { MetadataRoute } from "next";

const ICON_SVG =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" rx="96" fill="#0a0c10"/><circle cx="256" cy="256" r="150" fill="none" stroke="#5b9cff" stroke-width="28"/><circle cx="320" cy="200" r="60" fill="#0a0c10"/></svg>`,
  );

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nightshift",
    short_name: "Nightshift",
    description: "One-tap approval for production fixes.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0a0c10",
    theme_color: "#0a0c10",
    icons: [
      // Chromium requires BOTH 192 and 512 for installability (SVG is accepted).
      { src: ICON_SVG, sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: ICON_SVG, sizes: "512x512", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
