import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { KinematicsFrame } from "./kinematics";
import { BONES, LM, WRISTS, visibilityOf } from "./landmarks";

export interface SkeletonStyle {
  showLegs: boolean;
  minVisibility: number;
}

export interface SkeletonExtras {
  /** Unsmoothed pose, drawn as faint dots to compare against the filter */
  raw?: NormalizedLandmark[];
  /** Draws a velocity arrow from the throwing wrist */
  kin?: KinematicsFrame | null;
}

/** Arrow length = where the wrist will be this far in the future. */
const ARROW_LOOKAHEAD_S = 0.12;
/** Below this speed (torso lengths/s) the arrow is just noise. */
const ARROW_MIN_SPEED = 0.4;

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
  extras: SkeletonExtras = {},
) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  const scale = Math.max(1, Math.min(w, h) / 360);

  if (extras.raw) drawRawGhost(ctx, extras.raw, style.minVisibility, scale);
  if (!pose) return;

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

  if (extras.kin) {
    // Ring the throwing wrist so it's obvious which hand is being measured.
    const i = extras.kin.hand === "left" ? LM.LEFT_WRIST : LM.RIGHT_WRIST;
    if (ok(i)) {
      ctx.strokeStyle = "#ffe14d";
      ctx.lineWidth = 3 * scale;
      ctx.beginPath();
      ctx.arc(pose[i].x * w, pose[i].y * h, 18 * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawVelocityArrow(ctx, extras.kin);
  }
}

function drawRawGhost(ctx: CanvasRenderingContext2D, raw: NormalizedLandmark[], minVis: number, scale: number) {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = "rgba(120, 220, 255, 0.85)";
  for (const i of [11, 12, 13, 14, 15, 16, 23, 24]) {
    const lm = raw[i];
    if (!lm || visibilityOf(lm) < minVis) continue;
    ctx.beginPath();
    ctx.arc(lm.x * w, lm.y * h, 3 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Arrow from the throwing wrist along its velocity. Velocity is in torso
 * lengths/s; the torso is in square units (fractions of frame height), so
 * pixels = v * scale * frameHeight * seconds.
 */
export function drawVelocityArrow(ctx: CanvasRenderingContext2D, kin: KinematicsFrame) {
  const arm = kin.arms[kin.hand];
  if (!arm || arm.speed < ARROW_MIN_SPEED) return;
  const { width: w, height: h } = ctx.canvas;
  const scale = Math.max(1, Math.min(w, h) / 360);
  const k = kin.scale * h * ARROW_LOOKAHEAD_S;
  const x0 = arm.wrist.x * w;
  const y0 = arm.wrist.y * h;
  const x1 = x0 + arm.velocity.x * k;
  const y1 = y0 + arm.velocity.y * k;
  const angle = Math.atan2(y1 - y0, x1 - x0);
  const head = 12 * scale;

  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = "#ffe14d";
  ctx.shadowColor = "rgba(255, 225, 77, 0.9)";
  ctx.shadowBlur = 12 * scale;
  ctx.lineWidth = 4 * scale;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(angle - 0.45), y1 - head * Math.sin(angle - 0.45));
  ctx.lineTo(x1 - head * Math.cos(angle + 0.45), y1 - head * Math.sin(angle + 0.45));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
