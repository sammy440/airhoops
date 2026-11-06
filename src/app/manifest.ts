import type { MetadataRoute } from "next";

/**
 * Installs AirHoops as an app (Add to Home Screen / Install): it opens straight into the game,
 * full screen, without the browser bar. Served at /manifest.webmanifest and linked from every page.
 * Icons in public/icons are rendered from icon.svg (the maskable one keeps the ball inside the
 * safe zone, on the ink background).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "AirHoops",
    short_name: "AirHoops",
    description: "Shoot hoops with nothing but air: a camera-controlled basketball game.",
    start_url: "/play",
    scope: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    orientation: "any",
    background_color: "#121212",
    theme_color: "#ececea",
    categories: ["games", "sports"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Play", url: "/play", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Play a friend", url: "/multiplayer", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Leaderboard", url: "/leaderboard", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
