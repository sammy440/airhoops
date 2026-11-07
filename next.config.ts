import type { NextConfig } from "next";

// Camera only for this site (never embeds), no microphone/location; MediaPipe runs from our own origin.
const securityHeaders = [
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Each build gets its own service worker version (public/sw.js keeps a cache per release).
  env: { NEXT_PUBLIC_SW_VERSION: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? process.env.NEXT_PUBLIC_RELEASE ?? String(Date.now()) },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Pose models and WASM are large and rarely change: cache for a week, refresh in the background.
      { source: "/mediapipe/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" }] },
      // The service worker itself is always checked for a new version.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
