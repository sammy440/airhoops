"use client";

import { useEffect, useRef } from "react";
import { COURT_THEMES, drawCourtPreview, type CourtThemeId } from "@/lib/game/courts";

/** Thumbnail of a court theme, drawn with the same scenery code as the game. */
export function CourtPreview({ theme, className }: { theme: CourtThemeId; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawCourtPreview(ctx, COURT_THEMES[theme], rect.width, rect.height);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [theme]);

  return <canvas ref={ref} aria-hidden className={className} />;
}
