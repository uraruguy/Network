import type { MetadataRoute } from "next";
import { oklchToHex } from "@/lib/design/color";

// From the design tokens (globals.css): the canvas `--bg` (light), so the splash screen and the
// standalone window chrome match the first painted frame. Hex because manifests can't take OKLCH.
const CANVAS = oklchToHex(0.985, 0.004, 200);

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Network",
    short_name: "Network",
    description: "Your people, on a globe. Notes, follow-ups and an AI that knows your network.",
    id: "/",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: CANVAS,
    theme_color: CANVAS,
    categories: ["productivity", "social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add person", url: "/people?new=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Globe", url: "/globe", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Chat", url: "/chat", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
