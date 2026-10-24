import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { BONES, WRISTS, visibilityOf } from "./landmarks";

export interface SkeletonStyle {
  showLegs: boolean;
  minVisibility: number;
}

const COLORS = {
  torso: "rgba(255,255,255,0.75)",
  arms: "#ff7a1a",
  legs: "rgba(255,255,255,0.35)",
  joint: "#ffffff",
  wrist: "#ffb36b",
};

/**
 * Draws the pose onto a canvas whose pixel size matches the video frame.
 * Coordinates are raw (unmirrored); mirroring is handled with CSS so the
 * canvas and the video always line up.
 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  pose: NormalizedLandmark[] | undefined,
  style: SkeletonStyle,
) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  if (!pose) return;

  const scale = Math.max(1, Math.min(w, h) / 360);
  const ok = (i: number) => visibilityOf(pose[i]) >= style.minVisibility;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const groups: Array<keyof typeof BONES> = style.showLegs ? ["legs", "torso", "arms"] : ["torso", "arms"];
  for (const group of groups) {
    const isArm = group === "arms";
    ctx.strokeStyle = COLORS[group];
    ctx.lineWidth = (isArm ? 5 : 3) * scale;
    ctx.shadowColor = isArm ? "rgba(255,122,26,0.8)" : "transparent";
    ctx.shadowBlur = isArm ? 14 * scale : 0;
    ctx.beginPath();
    for (const [a, b] of BONES[group]) {
      if (!ok(a) || !ok(b)) continue;
      ctx.moveTo(pose[a].x * w, pose[a].y * h);
      ctx.lineTo(pose[b].x * w, pose[b].y * h);
    }
    ctx.stroke();
  }

  // Joints
  ctx.shadowBlur = 0;
  const joints = new Set<number>(Object.values(BONES).flat(2));
  if (!style.showLegs) {
    for (const [a, b] of BONES.legs) {
      joints.delete(a);
      joints.delete(b);
    }
  }
  for (const i of joints) {
    if (!ok(i) || (WRISTS as readonly number[]).includes(i)) continue;
    ctx.fillStyle = COLORS.joint;
    ctx.beginPath();
    ctx.arc(pose[i].x * w, pose[i].y * h, 3.5 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  // Wrists are the stars of the show: bigger, glowing rings.
  for (const i of WRISTS) {
    if (!ok(i)) continue;
    const x = pose[i].x * w;
    const y = pose[i].y * h;
    ctx.shadowColor = "rgba(255,122,26,0.9)";
    ctx.shadowBlur = 18 * scale;
    ctx.fillStyle = COLORS.wrist;
    ctx.beginPath();
    ctx.arc(x, y, 7 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.arc(x, y, 12 * scale, 0, Math.PI * 2);
    ctx.stroke();
  }
}
