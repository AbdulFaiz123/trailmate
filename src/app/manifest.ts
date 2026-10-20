import type { MetadataRoute } from "next";

// Makes Trailmate installable ("Add to Home Screen"). On iPhone, web push
// only works once the app is installed this way.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trailmate",
    short_name: "Trailmate",
    description: "Your whole trip in one place: stays, routes, lists and live alerts.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d1311",
    theme_color: "#0f766e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
