import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { LM, visibilityOf } from "./landmarks";

/**
 * Motion maths for the throwing arm.
 *
 * Coordinate space: MediaPipe x is a fraction of frame *width* and y of frame
 * *height*. We convert to "square" units (x * aspect, y) so distances aren't
 * skewed by a 16:9 camera, then divide by TORSO LENGTH (shoulder midpoint →
 * hip midpoint) so every number means the same thing whatever the player's
 * size or distance.
 *
 * Why torso and not shoulder width: in real recordings shoulder width swung
 * 40× as players turned side-on to throw, while torso length moved ±10%.
 *
 * Velocities are in raw (unmirrored) image orientation: +x right, +y down.
 */

export type Side = "left" | "right";
export type HandChoice = Side | "auto";
export interface Vec2 {
  x: number;
  y: number;
}

export interface ArmKinematics {
  side: Side;
  /** Wrist position in normalized image coords (for drawing) */
  wrist: Vec2;
  /** Wrist velocity, torso lengths per second (image orientation) */
  velocity: Vec2;
  /** |velocity|, torso lengths per second */
  speed: number;
  /** Degrees above horizontal, -90 (straight down) .. 90 (straight up) */
  angle: number;
  /** Interior elbow angle, 180 = fully straight */
  elbowAngle: number;
  /** Shoulder→wrist distance in torso lengths */
  extension: number;
  /** Wrist height above its shoulder, torso lengths (+ = above) */
  height: number;
  /** Wrist relative to its hip, torso lengths (+ = below the hip line) */
  belowHip: number;
}

export interface KinematicsFrame {
  t: number;
  /** Body scale = torso length in square units (fraction of frame height) */
  scale: number;
  arms: Record<Side, ArmKinematics | null>;
  /** Hand used for display/recording: the override, or the auto-detected one */
  hand: Side;
  /** What auto-detection currently thinks, regardless of override */
  autoHand: Side;
}

const ARM = {
  left: { shoulder: LM.LEFT_SHOULDER, elbow: LM.LEFT_ELBOW, wrist: LM.LEFT_WRIST, hip: LM.LEFT_HIP },
  right: { shoulder: LM.RIGHT_SHOULDER, elbow: LM.RIGHT_ELBOW, wrist: LM.RIGHT_WRIST, hip: LM.RIGHT_HIP },
} as const;

/** Look back this far for the velocity finite difference (≈2 frames at 30fps). */
export const VELOCITY_WINDOW_MS = 50;
/** Body-scale smoothing so jitter in it doesn't leak into every number. */
const SCALE_EMA = 0.15;
/**
 * Torso ≈ this × shoulder width when facing the camera. Only used to seed the
 * scale before the hips have ever been seen.
 */
export const SHOULDER_TO_TORSO = 2.3;
/** Activity EMA time constant used to pick the throwing hand. */
const ACTIVITY_TAU_MS = 600;
/** The other hand must be this much more active to take over. */
const HAND_SWITCH_RATIO = 1.3;
/** …and at least this active (torso/s), so idle jitter never flips it. */
const HAND_SWITCH_MIN = 0.5;
const MIN_VISIBILITY = 0.5;

const toSquare = (lm: NormalizedLandmark, aspect: number): Vec2 => ({ x: lm.x * aspect, y: lm.y });
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Vec2) => Math.hypot(v.x, v.y);
const deg = (rad: number) => (rad * 180) / Math.PI;

const ok = (lm: NormalizedLandmark | undefined) => visibilityOf(lm) >= MIN_VISIBILITY;
const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Shoulder width in square units, or 0 if shoulders aren't visible. */
export function shoulderWidth(pose: NormalizedLandmark[], aspect: number) {
  const l = pose[LM.LEFT_SHOULDER];
  const r = pose[LM.RIGHT_SHOULDER];
  if (!ok(l) || !ok(r)) return 0;
  return len(sub(toSquare(l, aspect), toSquare(r, aspect)));
}

/** Torso length (shoulder midpoint → hip midpoint) in square units, or 0. */
export function torsoLength(pose: NormalizedLandmark[], aspect: number) {
  const [ls, rs, lh, rh] = [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP].map((i) => pose[i]);
  if (!ok(ls) || !ok(rs) || !ok(lh) || !ok(rh)) return 0;
  return len(sub(mid(toSquare(ls, aspect), toSquare(rs, aspect)), mid(toSquare(lh, aspect), toSquare(rh, aspect))));
}

/** Interior angle at `b` formed by a-b-c, in degrees (0..180). */
export function jointAngle(a: Vec2, b: Vec2, c: Vec2) {
  const u = sub(a, b);
  const v = sub(c, b);
  const denom = len(u) * len(v);
  if (denom === 0) return 0;
  const cos = Math.min(1, Math.max(-1, (u.x * v.x + u.y * v.y) / denom));
  return deg(Math.acos(cos));
}

/** Elevation of a velocity vector: degrees above horizontal, either direction. */
export function elevationAngle(v: Vec2) {
  if (v.x === 0 && v.y === 0) return 0;
  return deg(Math.atan2(-v.y, Math.abs(v.x)));
}

interface Sample {
  t: number;
  p: Vec2;
}

/**
 * Stateful per-frame tracker. Feed it (ideally smoothed) poses in order.
 */
export class KinematicsTracker {
  private history: Record<Side, Sample[]> = { left: [], right: [] };
  private scale = 0;
  private activity: Record<Side, number> = { left: 0, right: 0 };
  private lastT = 0;
  private autoHand: Side = "right";

  reset() {
    this.history = { left: [], right: [] };
    this.scale = 0;
    this.activity = { left: 0, right: 0 };
  }

  update(pose: NormalizedLandmark[] | undefined, t: number, aspect: number, choice: HandChoice = "auto"): KinematicsFrame | null {
    if (!pose) {
      this.reset();
      return null;
    }
    // Body scale: torso when hips are visible; before hips are ever seen, seed
    // from shoulder width; if hips leave the frame, hold the last scale.
    const torso = torsoLength(pose, aspect);
    const shoulders = shoulderWidth(pose, aspect);
    const raw = torso > 0 ? torso : !this.scale && shoulders > 0 ? shoulders * SHOULDER_TO_TORSO : this.scale;
    if (raw <= 0) return null;
    this.scale = this.scale ? this.scale + SCALE_EMA * (raw - this.scale) : raw;

    const dtMs = this.lastT ? Math.max(1, t - this.lastT) : 33;
    this.lastT = t;

    const arms = { left: this.arm("left", pose, t, aspect), right: this.arm("right", pose, t, aspect) };

    // Activity = exponentially-weighted wrist speed; the busier hand is throwing.
    const k = 1 - Math.exp(-dtMs / ACTIVITY_TAU_MS);
    for (const side of ["left", "right"] as const) {
      this.activity[side] += k * ((arms[side]?.speed ?? 0) - this.activity[side]);
    }
    const other: Side = this.autoHand === "left" ? "right" : "left";
    if (
      this.activity[other] > HAND_SWITCH_MIN &&
      this.activity[other] > this.activity[this.autoHand] * HAND_SWITCH_RATIO
    ) {
      this.autoHand = other;
    }
    // If the chosen wrist is out of view, fall back to the visible one.
    let hand: Side = choice === "auto" ? this.autoHand : choice;
    if (!arms[hand] && arms[hand === "left" ? "right" : "left"]) hand = hand === "left" ? "right" : "left";

    return { t, scale: this.scale, arms, hand, autoHand: this.autoHand };
  }

  private arm(side: Side, pose: NormalizedLandmark[], t: number, aspect: number): ArmKinematics | null {
    const ids = ARM[side];
    const s = pose[ids.shoulder];
    const e = pose[ids.elbow];
    const w = pose[ids.wrist];
    const h = pose[ids.hip];
    if (!s || !e || !w || !ok(w) || !ok(s)) {
      this.history[side] = [];
      return null;
    }
    const S = toSquare(s, aspect);
    const E = toSquare(e, aspect);
    const W = toSquare(w, aspect);
    const sc = this.scale;

    // History of wrist positions; keep a little more than the window.
    const hist = this.history[side];
    hist.push({ t, p: W });
    while (hist.length > 2 && t - hist[1].t >= VELOCITY_WINDOW_MS) hist.shift();

    // Finite difference against the oldest sample within the window.
    let velocity: Vec2 = { x: 0, y: 0 };
    const ref = hist[0];
    if (ref && ref.t < t) {
      const dt = (t - ref.t) / 1000;
      const d = sub(W, ref.p);
      velocity = { x: d.x / dt / sc, y: d.y / dt / sc };
    }

    return {
      side,
      wrist: { x: w.x, y: w.y },
      velocity,
      speed: len(velocity),
      angle: elevationAngle(velocity),
      elbowAngle: jointAngle(S, E, W),
      extension: len(sub(W, S)) / sc,
      height: (S.y - W.y) / sc,
      belowHip: h ? (W.y - h.y) / sc : -Infinity,
    };
  }
}
