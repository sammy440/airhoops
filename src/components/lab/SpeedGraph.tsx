"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { KinematicsFrame } from "@/lib/pose/kinematics";

export interface SpeedGraphHandle {
  push: (t: number, kin: KinematicsFrame | null, recording: boolean) => void;
  /** Draws a marker for a detected throw at time t */
  markThrow: (t: number) => void;
  /** Peak throwing-hand speed over the last `ms` */
  peak: (ms: number) => number;
}

interface Point {
  t: number;
  hand: number;
  other: number;
  rec: boolean;
}

const WINDOW_MS = 4000;
const MIN_SCALE = 4; // torso lengths/s

/**
 * Scrolling wrist-speed chart, drawn imperatively from the pose loop
 * (no React re-render per frame). Throwing hand in red, other hand faint,
 * recording time shaded.
 */
export function SpeedGraph({ ref }: { ref: Ref<SpeedGraphHandle> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const points = useRef<Point[]>([]);
  const marks = useRef<number[]>([]);

  // Keep the backing store crisp at any size / DPR.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      push(t, kin, recording) {
        const other = kin ? (kin.hand === "left" ? "right" : "left") : "left";
        const pts = points.current;
        pts.push({ t, hand: kin?.arms[kin.hand]?.speed ?? 0, other: kin?.arms[other]?.speed ?? 0, rec: recording });
        while (pts.length && t - pts[0].t > WINDOW_MS) pts.shift();
        while (marks.current.length && t - marks.current[0] > WINDOW_MS) marks.current.shift();
        draw(canvasRef.current, pts, t, marks.current);
      },
      markThrow(t) {
        marks.current.push(t);
      },
      peak(ms) {
        const pts = points.current;
        const now = pts.at(-1)?.t ?? 0;
        let max = 0;
        for (let i = pts.length - 1; i >= 0 && now - pts[i].t <= ms; i--) max = Math.max(max, pts[i].hand);
        return max;
      },
    }),
    [],
  );

  return <canvas ref={canvasRef} className="h-36 w-full" aria-label="Wrist speed over the last 4 seconds" role="img" />;
}

function draw(canvas: HTMLCanvasElement | null, pts: Point[], now: number, marks: number[]) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx || !canvas.width) return;
  const { width: w, height: h } = canvas;
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, w, h);

  const max = Math.max(MIN_SCALE, ...pts.map((p) => p.hand)) * 1.1;
  const x = (t: number) => w - ((now - t) / WINDOW_MS) * w;
  const y = (v: number) => h - (v / max) * (h - 8 * dpr) - 2 * dpr;

  // Recording shading
  ctx.fillStyle = "rgba(234, 58, 29, 0.14)";
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].rec) ctx.fillRect(x(pts[i - 1].t), 0, x(pts[i].t) - x(pts[i - 1].t) + 1, h);
  }

  // Grid every 1 torso length/s
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = `${10 * dpr}px ui-monospace, monospace`;
  ctx.lineWidth = 1;
  for (let v = 1; v < max; v += 1) {
    ctx.beginPath();
    ctx.moveTo(0, y(v));
    ctx.lineTo(w, y(v));
    ctx.stroke();
    ctx.fillText(String(v), 4 * dpr, y(v) - 3 * dpr);
  }

  const line = (key: "hand" | "other", color: string, width: number) => {
    if (pts.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * dpr;
    ctx.lineJoin = "round";
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(x(p.t), y(p[key])) : ctx.moveTo(x(p.t), y(p[key]))));
    ctx.stroke();
  };
  line("other", "rgba(255,255,255,0.22)", 1.5);
  line("hand", "#ea3a1d", 2.5);

  // Detected throws
  ctx.strokeStyle = "#ffe14d";
  ctx.fillStyle = "#ffe14d";
  ctx.lineWidth = 1.5 * dpr;
  ctx.setLineDash([4 * dpr, 3 * dpr]);
  for (const m of marks) {
    ctx.beginPath();
    ctx.moveTo(x(m), 0);
    ctx.lineTo(x(m), h);
    ctx.stroke();
    ctx.fillText("THROW", x(m) - 34 * dpr, 12 * dpr);
  }
  ctx.setLineDash([]);
}
