"use client";

import { useImperativeHandle, useRef, type Ref } from "react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { drawSkeleton, type SkeletonExtras, type SkeletonStyle } from "@/lib/pose/drawSkeleton";

export interface SkeletonOverlayHandle {
  draw: (pose: NormalizedLandmark[] | undefined, extras?: SkeletonExtras) => void;
}

interface Props {
  ref: Ref<SkeletonOverlayHandle>;
  width: number;
  height: number;
  style: SkeletonStyle;
  mirrored: boolean;
}

/**
 * Canvas sized to the video's intrinsic resolution and laid out with the same
 * object-fit as the video, so landmarks line up at any container size.
 */
export function SkeletonOverlay({ ref, width, height, style, mirrored }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { showLegs, minVisibility } = style;

  useImperativeHandle(ref, () => ({
    draw(pose, extras) {
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawSkeleton(ctx, pose, { showLegs, minVisibility }, extras);
    },
  }), [showLegs, minVisibility]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      style={{ transform: mirrored ? "scaleX(-1)" : undefined }}
    />
  );
}
