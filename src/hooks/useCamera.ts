"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export type CameraErrorKind = "unsupported" | "insecure" | "denied" | "not_found" | "in_use" | "unknown";

export type CameraState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "live"; width: number; height: number }
  | { status: "error"; kind: CameraErrorKind; detail?: string };

class EnvironmentError extends Error {
  constructor(readonly kind: CameraErrorKind) {
    super(kind);
  }
}

function classify(err: unknown): CameraErrorKind {
  const name = err instanceof DOMException || err instanceof Error ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "OverconstrainedError":
    case "DevicesNotFoundError":
      return "not_found";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "in_use";
    default:
      return "unknown";
  }
}

/**
 * Owns the webcam stream and attaches it to the given <video>.
 * Nothing here ever leaves the browser.
 */
export function useCamera(
  videoRef: RefObject<HTMLVideoElement | null>,
  deviceId?: string,
  enabled = true,
  /** Requested capture size. The pose model downsamples to 256 px, so the game asks for less. */
  resolution: { width: number; height: number } = { width: 1280, height: 720 },
) {
  const { width: reqW, height: reqH } = resolution;
  const [state, setState] = useState<CameraState>({ status: "requesting" });
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [attempt, setAttempt] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices(all.filter((d) => d.kind === "videoinput"));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const video = videoRef.current;

    const open = async () => {
      if (!window.isSecureContext) throw new EnvironmentError("insecure");
      if (!navigator.mediaDevices?.getUserMedia) throw new EnvironmentError("unsupported");
      return navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // `ideal` so a stale saved device falls back to the default camera.
          deviceId: deviceId ? { ideal: deviceId } : undefined,
          facingMode: deviceId ? undefined : "user",
          width: { ideal: reqW },
          height: { ideal: reqH },
          frameRate: { ideal: 60, max: 60 },
        },
      });
    };

    open()
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        const settings = stream.getVideoTracks()[0]?.getSettings() ?? {};
        setState({
          status: "live",
          // videoWidth reflects the real (possibly rotated) frame on phones.
          width: video?.videoWidth || settings.width || 1280,
          height: video?.videoHeight || settings.height || 720,
        });
        // Labels are only populated after permission is granted.
        refreshDevices();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const kind = err instanceof EnvironmentError ? err.kind : classify(err);
        setState({ status: "error", kind, detail: err instanceof Error ? err.message : String(err) });
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [videoRef, deviceId, attempt, refreshDevices, enabled, reqW, reqH]);

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    md.addEventListener("devicechange", refreshDevices);
    return () => md.removeEventListener("devicechange", refreshDevices);
  }, [refreshDevices]);

  const retry = useCallback(() => {
    setState({ status: "requesting" });
    setAttempt((n) => n + 1);
  }, []);

  // Disabled = camera off (keyboard-only play): report idle, never "requesting".
  return { state: enabled ? state : ({ status: "idle" } as CameraState), devices, retry };
}
