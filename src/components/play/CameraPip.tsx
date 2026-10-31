"use client";

import { useEffect, type RefObject } from "react";
import { SkeletonOverlay, type SkeletonOverlayHandle } from "@/components/lab/SkeletonOverlay";
import type { CameraErrorKind, CameraState } from "@/hooks/useCamera";
import type { MotionReadout } from "@/hooks/useThrowInput";
import type { GameCore } from "@/lib/game/engine";
import type { DetectorState, ThrowParams } from "@/lib/pose/throwDetector";
import type { TrackerState } from "@/hooks/usePoseTracking";
import { MotionOverlay } from "./MotionOverlay";

export const COACH: Record<DetectorState, { text: string; tone: string }> = {
  IDLE: { text: "Raise the ball above your head", tone: "bg-white/15 text-cream" },
  PICKUP: { text: "Scoop it up…", tone: "bg-white/15 text-cream" },
  WINDUP: { text: "Loaded. Shoot!", tone: "bg-[#ffe14d] text-ink" },
  THROW: { text: "Shooting…", tone: "bg-hoop text-cream" },
  COOLDOWN: { text: "Nice. Reset.", tone: "bg-good text-ink" },
};

interface Props {
  boxRef: RefObject<HTMLDivElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  pipRef: RefObject<SkeletonOverlayHandle | null>;
  camera: boolean;
  cam: CameraState;
  tracker: TrackerState;
  detectorState: DetectorState;
  motion: MotionReadout | null;
  thresholds: ThrowParams;
  slowFps?: number | null;
  /** Replaces the coaching chip (e.g. "Bola is shooting…" in a shootout) */
  coachOverride?: { text: string; tone: string } | null;
  onRetryCamera: () => void;
  onRetryTracker: () => void;
}

/** Bottom-left camera preview with skeleton, motion numbers and a coaching chip. */
export function CameraPip({
  boxRef,
  videoRef,
  pipRef,
  camera,
  cam,
  tracker,
  detectorState,
  motion,
  thresholds,
  slowFps,
  coachOverride,
  onRetryCamera,
  onRetryTracker,
}: Props) {
  const tracking = tracker.status === "ready";
  const camProblem = camera && cam.status === "error";
  const trackerProblem = camera && tracker.status === "error";
  const coach = coachOverride ?? COACH[detectorState];

  return (
    <div ref={boxRef} className="absolute top-24 left-3 z-10 w-48 sm:top-auto sm:bottom-6 sm:left-6 sm:w-72 lg:w-80 xl:w-96">
      {camera ? (
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-cream/15 bg-black/60 shadow-2xl">
          <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover opacity-75" style={{ transform: "scaleX(-1)" }} />
          {cam.status === "live" && (
            <SkeletonOverlay ref={pipRef} width={cam.width} height={cam.height} mirrored style={{ showLegs: false, minVisibility: 0.5 }} />
          )}
          {tracking && <MotionOverlay motion={motion} thresholds={thresholds} />}
          {!tracking && !camProblem && !trackerProblem && (
            <div className="absolute inset-0 grid place-items-center bg-black/40 p-2 text-center text-[11px] text-cream/80">
              <div>
                <div className="mx-auto mb-1.5 size-4 animate-spin rounded-full border-2 border-white/20 border-t-hoop" />
                {cam.status === "live" ? "Downloading pose model…" : "Starting camera…"}
                {cam.status === "live" && <div className="mt-0.5 text-cream/50">Space works meanwhile</div>}
              </div>
            </div>
          )}
          {trackerProblem && <Problem text="Pose model failed to load." onRetry={onRetryTracker} />}
          {cam.status === "error" && camera && <Problem text={CAMERA_PROBLEM[cam.kind]} onRetry={onRetryCamera} />}
        </div>
      ) : (
        <div className="glass rounded-2xl p-3 text-[11px] text-cream/80">Camera off · hold Space or press the court to shoot</div>
      )}
      {camera && tracking && <div className={`mt-2 rounded-full px-3 py-1 text-center text-xs font-semibold transition-colors ${coach.tone}`}>{coach.text}</div>}
      {slowFps != null && (
        <div className="mt-2 rounded-full bg-warn/20 px-3 py-1 text-center text-[11px] text-warn">Slow tracking ({Math.round(slowFps)} fps): close other tabs</div>
      )}
    </div>
  );
}

/** Short, actionable camera messages for the small preview (the Lab shows the long versions). */
const CAMERA_PROBLEM: Record<CameraErrorKind, string> = {
  denied: "Camera blocked. Allow it from the camera icon in your address bar, or play with Space / tap. Video never leaves your device.",
  not_found: "No camera found. Play with Space / tap, or plug one in.",
  in_use: "Camera busy in another app (Zoom, Meet…). Close it and retry.",
  insecure: "Camera needs HTTPS. Play with Space / tap.",
  unsupported: "This browser can't use a camera. Play with Space / tap.",
  unknown: "Camera unavailable. Play with Space / tap.",
};

function Problem({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div role="status" className="absolute inset-0 grid place-items-center bg-black/70 p-2 text-center text-[11px] leading-snug text-cream/90">
      <div>
        {text}
        <button type="button" onClick={onRetry} className="mt-1 block w-full underline">
          Retry
        </button>
      </div>
    </div>
  );
}

/** Keeps the court beside the camera preview (it's left-aligned and tall on wide screens). */
/** `engine`: changes when the game engine is recreated (e.g. a renderer switch), so the new one gets the inset too. */
export function useCourtInset(gameRef: RefObject<GameCore | null>, boxRef: RefObject<HTMLDivElement | null>, camera: boolean, engine?: string) {
  useEffect(() => {
    const box = boxRef.current;
    const update = () => {
      const game = gameRef.current;
      if (!game || !box) return;
      const wide = window.matchMedia("(min-width: 640px)").matches; // below sm the preview sits up top
      game.setLeftInset(camera && wide ? box.getBoundingClientRect().right + 16 : 0);
    };
    update();
    const ro = new ResizeObserver(update);
    if (box) ro.observe(box);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [gameRef, boxRef, camera, engine]);
}
