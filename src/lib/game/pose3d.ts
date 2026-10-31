import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { LM, visibilityOf } from "@/lib/pose/landmarks";
import type { Vec3 } from "./engine";

/**
 * The shooter's skeleton in physics space (x = toward the hoop, y = up, z = right),
 * for the 3D renderer.
 *
 * With a camera: the live pose, mirror-style (we see the player's back, so their right
 * is our right), scaled so the torso is TORSO_M long. Only image x / y are used: the
 * pose's depth (z) is too noisy to turn the body with (±30° frame to frame when
 * standing square in the lab recordings). Legs are solved, not tracked: the camera
 * rarely sees them well, so hips sit at a height (lower when the knees bend, if the
 * camera does see them) and fixed-length thighs and shins bend to reach the floor.
 *
 * Without one (keyboard, or watching someone else's shot): a set-shot stance that
 * dips while charging and plays a release, jump and follow-through after each launch.
 */

export type Joint = 0 | 11 | 12 | 13 | 14 | 15 | 16 | 19 | 20 | 23 | 24 | 25 | 26 | 27 | 28;
export type Skeleton = Record<Joint, Vec3>;

export interface Body {
  pts: Skeleton;
  /** Following a live pose (else the animated stance) */
  live: boolean;
}

export const TORSO_M = 0.55;
export const THIGH_M = 0.46;
export const SHIN_M = 0.46;
/** Shoulder midpoint when standing tall, and where the player stands. */
export const STAND = { x: -0.3, y: 1.5 };
const ANKLE_Y = 0.08;
/** Deepest knee dip (m) read from the camera. */
const MAX_DIP = 0.3;
const MIN_VIS = 0.4;

const UPPER: Joint[] = [0, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24];
const ARMS = new Set<Joint>([13, 14, 15, 16, 19, 20]);

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const lerp = (a: Vec3, b: Vec3, k: number): Vec3 => v(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const smoothstep = (k: number) => k * k * (3 - 2 * k);

/** Ball held over the head, elbows out: the "set". Legs are filled in by withLegs(). */
const SET: Partial<Skeleton> = {
  0: v(-0.3, 1.74, 0),
  11: v(-0.3, 1.5, -0.2),
  12: v(-0.3, 1.5, 0.2),
  13: v(-0.17, 1.82, -0.3),
  14: v(-0.17, 1.82, 0.3),
  15: v(-0.04, 2.12, -0.12),
  16: v(-0.04, 2.12, 0.12),
  19: v(0.03, 2.2, -0.1),
  20: v(0.03, 2.2, 0.1),
  23: v(-0.3, 0.95, -0.12),
  24: v(-0.3, 0.95, 0.12),
};
/** Just after release: shooting (right) arm straight up and out, wrist flicked down; guide hand off the ball. */
const RELEASE: Partial<Skeleton> = {
  ...SET,
  13: v(-0.22, 1.78, -0.32),
  15: v(-0.08, 2.08, -0.2),
  19: v(-0.04, 2.16, -0.2),
  14: v(-0.08, 2.08, 0.22),
  16: v(0.12, 2.5, 0.12),
  20: v(0.24, 2.44, 0.12),
};

/** Seconds of the shot animation: release, hold the follow-through, back to the set. */
const SHOT = { release: 0.12, hold: 0.9, back: 1.3, jump: 0.09 };

/**
 * Two-bone leg from hip to a foot on the floor: the knee bends forward (towards the
 * hoop) so thigh and shin keep their length.
 */
function leg(hip: Vec3, footZ: number): { knee: Vec3; ankle: Vec3 } {
  let ankle = v(hip.x, ANKLE_Y, footZ);
  let dy = hip.y - ankle.y;
  const dz = ankle.z - hip.z;
  const max = THIGH_M + SHIN_M - 1e-6;
  const span = Math.hypot(dy, dz);
  if (span > max) {
    // Hips higher than the legs reach (a hop): the foot leaves the floor on a straight leg.
    dy *= max / span;
    ankle = v(hip.x, hip.y - dy, hip.z + (dz * max) / span);
  }
  const reach = Math.min(span, max);
  // Equal-length bones: the knee sits halfway down, pushed forward by the bend.
  const forward = Math.sqrt(Math.max(0, THIGH_M * THIGH_M - (reach / 2) ** 2));
  return { knee: v(hip.x + forward, hip.y - dy / 2, (hip.z + ankle.z) / 2), ankle };
}

function withLegs(upper: Partial<Skeleton>, feet: { left: number; right: number } = { left: -0.17, right: 0.17 }): Skeleton {
  const pts = { ...upper } as Skeleton;
  const l = leg(pts[23], feet.left);
  const r = leg(pts[24], feet.right);
  pts[25] = l.knee;
  pts[26] = r.knee;
  pts[27] = l.ankle;
  pts[28] = r.ankle;
  return pts;
}

/** Moves the whole upper body (not the feet) down by `dip` and up by `lift`. */
function shift(upper: Partial<Skeleton>, dy: number): Partial<Skeleton> {
  const out: Partial<Skeleton> = {};
  for (const [k, p] of Object.entries(upper) as [string, Vec3][]) out[+k as Joint] = v(p.x, p.y + dy, p.z);
  return out;
}

/**
 * The animated stance. `sinceLaunch`: seconds since the last shot left the hands (null if
 * none yet); `charge`: keyboard charge 0..1 (null when not charging).
 */
export function restBody(sinceLaunch: number | null, charge: number | null): Body {
  let upper: Partial<Skeleton> = SET;
  let dy = 0;
  const s = sinceLaunch;
  if (s !== null && s >= 0 && s < SHOT.back) {
    const k = s < SHOT.release ? smoothstep(s / SHOT.release) : s < SHOT.hold ? 1 : 1 - smoothstep((s - SHOT.hold) / (SHOT.back - SHOT.hold));
    upper = Object.fromEntries((Object.keys(SET) as unknown as Joint[]).map((j) => [j, lerp(SET[j]!, RELEASE[j]!, k)])) as Partial<Skeleton>;
    dy = Math.sin(Math.min(1, s / 0.5) * Math.PI) * SHOT.jump; // a little hop through the release
  } else if (charge !== null) {
    dy = -0.12 * charge; // sink into the legs while charging
  }
  return { pts: withLegs(shift(upper, dy)), live: false };
}

/** Knee bend seen by the camera, as a dip in metres (0 when the legs aren't visible). */
function dipFrom(p: NormalizedLandmark[], aspect: number) {
  const bends: number[] = [];
  for (const [hip, knee, ankle] of [
    [LM.LEFT_HIP, 25, 27],
    [LM.RIGHT_HIP, 26, 28],
  ] as const) {
    const pts = [p[hip], p[knee], p[ankle]];
    if (pts.some((q) => visibilityOf(q) < 0.5)) continue;
    const d = (a: NormalizedLandmark, b: NormalizedLandmark) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
    // 1 = straight leg; a bent knee shortens hip → ankle against the two bones.
    const straight = d(pts[0], pts[2]) / (d(pts[0], pts[1]) + d(pts[1], pts[2]));
    bends.push(1 - straight);
  }
  if (!bends.length) return 0;
  const bend = bends.reduce((a, b) => a + b, 0) / bends.length;
  return clamp(bend * 1.6, 0, MAX_DIP);
}

/** The live pose as a 3D skeleton, or null if the shoulders aren't visible. */
export function liveBody(p: NormalizedLandmark[] | undefined, aspect = 16 / 9): Body | null {
  if (!p) return null;
  const ls = p[LM.LEFT_SHOULDER];
  const rs = p[LM.RIGHT_SHOULDER];
  const lh = p[LM.LEFT_HIP];
  const rh = p[LM.RIGHT_HIP];
  if (visibilityOf(ls) < 0.5 || visibilityOf(rs) < 0.5) return null;
  const sx = (ls.x + rs.x) / 2;
  const sy = (ls.y + rs.y) / 2;
  const hipsOk = visibilityOf(lh) > MIN_VIS && visibilityOf(rh) > MIN_VIS;
  const torso = hipsOk ? Math.hypot(((lh.x + rh.x) / 2 - sx) * aspect, (lh.y + rh.y) / 2 - sy) : 0;
  const k = TORSO_M / (torso || 0.3);
  const dip = dipFrom(p, aspect);
  const shoulderY = STAND.y - dip;

  const upper: Partial<Skeleton> = { ...shift(SET, -dip) };
  for (const i of UPPER) {
    const lm = p[i];
    if (visibilityOf(lm) < MIN_VIS) continue;
    const y = shoulderY - (lm.y - sy) * k;
    const z = -(lm.x - sx) * aspect * k;
    // Raised arms reach forward over the head, towards the hoop.
    const reach = ARMS.has(i) ? clamp((y - shoulderY) * 0.4, 0, 0.3) : 0;
    upper[i] = v(STAND.x + reach, y, z);
  }
  if (!hipsOk) {
    upper[23] = v(STAND.x, shoulderY - TORSO_M, upper[11]!.z * 0.7);
    upper[24] = v(STAND.x, shoulderY - TORSO_M, upper[12]!.z * 0.7);
  }
  // Feet: under the tracked ankles if seen, else a stance just wider than the hips.
  const foot = (ankle: number, fallback: number) => (visibilityOf(p[ankle]) >= 0.5 ? clamp(-(p[ankle].x - sx) * aspect * k, -0.6, 0.6) : fallback);
  const pts = withLegs(upper, { left: foot(27, upper[23]!.z - 0.05), right: foot(28, upper[24]!.z + 0.05) });
  return { pts, live: true };
}
