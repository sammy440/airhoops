"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/monitoring";

// Replaces the root layout when it crashes, so no global styles: keep it self-contained.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => reportError(error), [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#0e0e0d", color: "#f7f1d6", fontFamily: "system-ui, sans-serif" }}>
        <title>AirHoops</title>
        <div style={{ textAlign: "center", padding: 20 }}>
          <h1 style={{ fontSize: 32, margin: 0 }}>Something went wrong</h1>
          <p style={{ opacity: 0.65 }}>We&apos;ve logged it. Please try again.</p>
          <button type="button" onClick={retry} style={{ background: "#ea3a1d", color: "#f7f1d6", border: 0, borderRadius: 999, padding: "10px 24px", fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
