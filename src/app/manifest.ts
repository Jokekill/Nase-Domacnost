import type { MetadataRoute } from "next";

/** Installable app (zadání §7.1). Colours from docs/DESIGN.md §2. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Naše domácnost",
    short_name: "Domácnost",
    description: "Kuchařka a organizace domácnosti",
    start_url: "/kucharka",
    display: "standalone",
    background_color: "#FAF6EF",
    theme_color: "#C2571B",
    lang: "cs",
    orientation: "portrait-primary",
    categories: ["food", "lifestyle", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Nákupní seznam", url: "/nakup" },
      { name: "Jídelníček", url: "/jidelnicek" },
    ],
  };
}
