/**
 * Minimal browser error tracking: uncaught errors and promise rejections are
 * reported to the API (`POST /telemetry/errors`), which logs them and forwards
 * to Sentry when configured. Only the error text is sent: never video,
 * landmarks or personal data.
 */
import { API_URL } from "@/lib/net/api";

const MAX_REPORTS = 5;
let sent = 0;
const seen = new Set<string>();

export function reportError(error: unknown, extra?: { url?: string }) {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "production") return;
  const e = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  const message = `${e.name}: ${e.message}`.slice(0, 500);
  if (seen.has(message) || sent >= MAX_REPORTS) return;
  seen.add(message);
  sent++;
  const body = JSON.stringify({
    message,
    stack: e.stack?.slice(0, 4000),
    url: (extra?.url ?? location.pathname).slice(0, 300),
    release: process.env.NEXT_PUBLIC_RELEASE?.slice(0, 64),
  });
  try {
    // keepalive lets the report finish even if the page is closing.
    void fetch(`${API_URL}/telemetry/errors`, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {}
}

/** Call once on the client; returns a cleanup function. */
export function installErrorReporting() {
  const onError = (ev: ErrorEvent) => reportError(ev.error ?? ev.message);
  const onRejection = (ev: PromiseRejectionEvent) => reportError(ev.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
