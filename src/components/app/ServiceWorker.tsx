"use client";

import { useEffect } from "react";

/** The release this build is (set in next.config.ts): each one installs its own service worker. */
export const SW_VERSION = process.env.NEXT_PUBLIC_SW_VERSION ?? "dev";

/**
 * Registers public/sw.js in production, so the game opens fast and plays solo offline (see sw.js).
 * Not in development: it would cache hot-reloaded code.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(SW_VERSION)}`, { scope: "/" }).catch(() => {});
    // After the page has loaded, so it never competes with the first paint or the pose model
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
