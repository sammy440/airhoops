"use client";

import type { ReactNode, RefObject } from "react";

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  mirrored: boolean;
  showVideo: boolean;
  /** Layers drawn above the video: skeleton canvas, HUD, errors. */
  children?: ReactNode;
}

/** 16:9 stage with the (optionally mirrored) webcam video. */
export function CameraFeed({ videoRef, mirrored, showVideo, children }: Props) {
  return (
    <div className="grain relative aspect-video w-full overflow-hidden rounded-3xl border border-line bg-surface text-cream shadow-[0_40px_120px_-40px_rgba(255,122,26,0.35)]">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${showVideo ? "opacity-100" : "opacity-0"}`}
        style={{ transform: mirrored ? "scaleX(-1)" : undefined }}
      />
      {!showVideo && (
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(rgb(255 255 255 / .05) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / .05) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      )}
      {children}
    </div>
  );
}
