"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_AVATAR, sanitizeAvatar, type Avatar } from "@/lib/game/avatar";
import { DEFAULT_POSE, drawPlayer, STANDING_POSE } from "@/lib/game/drawPlayer";

/**
 * Renders a player look with the same drawing code as the game.
 * "full" shows the whole body (profile preview), "bust" a head-and-chest
 * crop for badges in the lobby and scoreboard.
 */
export function AvatarCanvas({
  avatar,
  crop = "full",
  pose = "standing",
  className,
  label,
}: {
  avatar?: Avatar | null;
  crop?: "full" | "bust";
  pose?: "standing" | "shooting";
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Untrusted when it comes from another player: always sanitize before drawing.
  const look = avatar ? sanitizeAvatar(avatar) : DEFAULT_AVATAR;
  const key = JSON.stringify(look);

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
      ctx.clearRect(0, 0, rect.width, rect.height);

      const pts = pose === "shooting" ? DEFAULT_POSE : STANDING_POSE;
      // World window (meters) to fit: whole body, or head + chest.
      const [cx, top, bottom, width] =
        crop === "full" ? [pose === "shooting" ? -0.18 : 0, pose === "shooting" ? 2.3 : 2.05, -0.02, 1.0] : [pts[0].x, 2.06, 1.1, 0.9];
      const s = Math.min(rect.height / (top - bottom), rect.width / width);
      const font = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "Impact, sans-serif";
      drawPlayer(ctx, pts, JSON.parse(key) as Avatar, {
        X: (x) => rect.width / 2 + (x - cx) * s,
        Y: (y) => rect.height - (y - bottom) * s - (rect.height - (top - bottom) * s) / 2,
        s,
        font,
        glow: false,
      });
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [key, crop, pose]);

  return <canvas ref={ref} role="img" aria-label={label ?? "Player avatar"} className={className} />;
}
