import type { CameraErrorKind } from "@/hooks/useCamera";

const COPY: Record<CameraErrorKind, { title: string; body: string; canRetry: boolean }> = {
  denied: {
    title: "Camera access is blocked",
    body: "AirHoops needs your camera to see your throws. Click the camera icon in your address bar, allow access, then try again. Video never leaves your device.",
    canRetry: true,
  },
  not_found: {
    title: "No camera found",
    body: "Plug in a webcam or switch to a device with a front camera, then try again.",
    canRetry: true,
  },
  in_use: {
    title: "Camera is busy",
    body: "Another app or tab is using your camera. Close it (Zoom, Meet, FaceTime…) and try again.",
    canRetry: true,
  },
  insecure: {
    title: "Secure connection required",
    body: "Browsers only allow camera access over HTTPS or on localhost. Open AirHoops from a secure URL.",
    canRetry: false,
  },
  unsupported: {
    title: "Browser not supported",
    body: "This browser can't access a camera. Try the latest Chrome, Edge, Safari or Firefox.",
    canRetry: false,
  },
  unknown: {
    title: "Couldn't start the camera",
    body: "Something went wrong while starting your camera.",
    canRetry: true,
  },
};

export function CameraError({ kind, detail, onRetry }: { kind: CameraErrorKind; detail?: string; onRetry: () => void }) {
  const c = COPY[kind];
  return (
    <div className="absolute inset-0 grid place-items-center bg-ink/90 p-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-bad/15 text-bad">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M3 3l18 18M10.6 5H15l1.5 2H19a2 2 0 0 1 2 2v8.4M17 19H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2" strokeLinecap="round" />
            <path d="M9.5 10.5a3.5 3.5 0 0 0 4.9 4.9" strokeLinecap="round" />
          </svg>
        </div>
        <h2 className="font-display text-xl font-semibold">{c.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{c.body}</p>
        {kind === "unknown" && detail && <p className="mt-2 font-mono text-xs text-muted/70">{detail}</p>}
        {c.canRetry && (
          <button
            onClick={onRetry}
            className="mt-5 rounded-full bg-hoop px-5 py-2 text-sm font-semibold text-ink transition hover:bg-hoop-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hoop"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
