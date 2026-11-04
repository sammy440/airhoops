/**
 * Developer-only pages (the tracking lab): on under `next dev`, off in production builds.
 * Set NEXT_PUBLIC_ENABLE_LAB=1 to keep them in a production build (e.g. to test one locally).
 */
export const DEV_TOOLS = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_LAB === "1";
