import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { LM, visibilityOf } from "@/lib/pose/landmarks";
import type { Vec3 } from "./engine";

/**
 * The shooter's skeleton in physics space (x = toward the hoop, y = up, z = right),
 * for the 3D renderer.
 *
 * With a camera: Retargeter. The avatar keeps its own proportions and the pose only
 * steers it (bone directions, lean, tilt, knee dip), so standing too close, off to the
 * side or half out of frame never stretches or squashes it. Only image x / y are used:
 * the pose's depth (z) is too noisy (±30° frame to frame standing square in the lab).
 * Legs are solved, not tracked: hips sit at a height (lower when the camera sees the
 * knees bend) and fixed-length thighs and shins bend to reach the floor.
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

// ── Live pose → the avatar's own body (retargeting) ──

const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const add = (a: Vec3, d: Vec3, k: number): Vec3 => v(a.x + d.x * k, a.y + d.y * k, a.z + d.z * k);
const unit = (a: Vec3, b: Vec3): Vec3 => {
  const n = dist(a, b) || 1;
  return v((b.x - a.x) / n, (b.y - a.y) / n, (b.z - a.z) / n);
};

/** The avatar's proportions: the stance's own bone lengths, so the live pose and the stance match. */
export const BONES = {
  shoulderHalf: 0.2,
  hipHalf: 0.12,
  upperArm: dist(SET[11]!, SET[13]!),
  forearm: dist(SET[13]!, SET[15]!),
  hand: dist(SET[15]!, SET[19]!),
};

type Bone = "lUpper" | "lFore" | "lHand" | "rUpper" | "rFore" | "rHand";
/** Each arm bone: landmarks it runs between, its length, and its direction in the stance (the fallback). */
const ARM_BONES: { bone: Bone; from: Joint; to: Joint; len: number }[] = [
  { bone: "lUpper", from: 11, to: 13, len: BONES.upperArm },
  { bone: "lFore", from: 13, to: 15, len: BONES.forearm },
  { bone: "lHand", from: 15, to: 19, len: BONES.hand },
  { bone: "rUpper", from: 12, to: 14, len: BONES.upperArm },
  { bone: "rFore", from: 14, to: 16, len: BONES.forearm },
  { bone: "rHand", from: 16, to: 20, len: BONES.hand },
];
const REST_DIR = Object.fromEntries(ARM_BONES.map((b) => [b.bone, unit(SET[b.from]!, SET[b.to]!)])) as Record<Bone, Vec3>;

/** A bone the camera loses keeps its last direction this long, then eases back to the stance. */
const HOLD_MS = 600;
const RETURN_MS = 400;
/** Most the upper body leans / the shoulders tilt, whatever the camera says. */
const MAX_LEAN_M = 0.15;
const MAX_TILT = (25 * Math.PI) / 180;

/**
 * Drives the avatar from the camera without ever distorting it.
 *
 * Copying joint positions would carry every camera problem onto the body: standing too
 * close (scale off), arms pointing at the camera (they look short), joints dropping out
 * (they jump). So the avatar keeps its own proportions (BONES) and the pose only gives
 * directions: which way each arm bone points, how far the upper body leans and the
 * shoulders tilt, how deep the knees bend. Where you stand in the frame doesn't matter.
 *
 * A bone that looks shorter on camera than it is points towards the camera (towards the
 * hoop): the missing length becomes forward reach, so a push at the screen reads as one.
 * A bone the camera loses holds its last direction for HOLD_MS, then eases back to the stance.
 */
export class Retargeter {
  /** Image size of a metre of body (square units), learned from the torso. */
  private scale = 0;
  private memory: Partial<Record<Bone, { dir: Vec3; t: number }>> = {};

  /** The live pose as the avatar's skeleton, or null if the shoulders aren't visible. */
  body(p: NormalizedLandmark[] | undefined, t: number, aspect = 16 / 9): Body | null {
    if (!p) return null;
    const [ls, rs, lh, rh] = [p[LM.LEFT_SHOULDER], p[LM.RIGHT_SHOULDER], p[LM.LEFT_HIP], p[LM.RIGHT_HIP]];
    if (visibilityOf(ls) < 0.5 || visibilityOf(rs) < 0.5) return null;
    const sq = (lm: NormalizedLandmark) => ({ x: lm.x * aspect, y: lm.y });
    const S = { x: (sq(ls).x + sq(rs).x) / 2, y: (sq(ls).y + sq(rs).y) / 2 };
    const hipsOk = visibilityOf(lh) > MIN_VIS && visibilityOf(rh) > MIN_VIS;
    const H = hipsOk ? { x: (sq(lh).x + sq(rh).x) / 2, y: (sq(lh).y + sq(rh).y) / 2 } : null;

    // Scale from the torso (steady as people turn); before the hips are ever seen, from the shoulders.
    const raw = H ? Math.hypot(S.x - H.x, S.y - H.y) / TORSO_M : this.scale ? 0 : Math.abs(sq(ls).x - sq(rs).x) / (2 * BONES.shoulderHalf);
    if (raw > 0) this.scale = this.scale ? this.scale + 0.2 * (raw - this.scale) : raw;
    const scale = this.scale;

    // Trunk: a dip (knees), a sideways lean (shoulders over hips), a shoulder tilt. Player's right is image left.
    const dip = dipFrom(p, aspect);
    const shoulderY = STAND.y - dip;
    const lean = H ? clamp(-(S.x - H.x) / scale, -MAX_LEAN_M, MAX_LEAN_M) : 0;
    // + when the right shoulder sits higher (image y grows downwards)
    const tilt = clamp(Math.atan2(sq(ls).y - sq(rs).y, Math.abs(sq(ls).x - sq(rs).x)), -MAX_TILT, MAX_TILT);
    const across = v(0, Math.sin(tilt), Math.cos(tilt)); // from the left shoulder to the right one
    const mid = v(STAND.x, shoulderY, lean);
    const pts = { ...shift(SET, -dip) } as Skeleton;
    pts[11] = add(mid, across, -BONES.shoulderHalf);
    pts[12] = add(mid, across, BONES.shoulderHalf);
    pts[23] = v(STAND.x, shoulderY - TORSO_M, -BONES.hipHalf);
    pts[24] = v(STAND.x, shoulderY - TORSO_M, BONES.hipHalf);

    // Arms: fixed lengths along the camera's directions
    for (const b of ARM_BONES) pts[b.to] = add(pts[b.from], this.direction(b.bone, p[b.from], p[b.to], b.len, scale, t, aspect), b.len);

    // Head: above the shoulders, nodding sideways towards the nose
    const nose = p[LM.NOSE];
    const nod = visibilityOf(nose) >= 0.5 ? clamp(-((nose.x * aspect - S.x) / scale), -0.06, 0.06) : 0;
    pts[0] = v(STAND.x, shoulderY + 0.24, lean + nod);

    return { pts: withLegs(pts), live: true };
  }

  private direction(bone: Bone, a: NormalizedLandmark | undefined, b: NormalizedLandmark | undefined, len: number, scale: number, t: number, aspect: number): Vec3 {
    if (visibilityOf(a) >= MIN_VIS && visibilityOf(b) >= MIN_VIS && scale > 0) {
      const dx = (b!.x - a!.x) * aspect;
      const dy = b!.y - a!.y;
      const seen = Math.hypot(dx, dy);
      // How much of the bone the camera sees side-on; the rest points at the camera (forward).
      const f = Math.min(1, seen / (len * scale));
      const dir = seen > 1e-9 ? v(Math.sqrt(1 - f * f), (-dy / seen) * f, (-dx / seen) * f) : v(1, 0, 0);
      this.memory[bone] = { dir, t };
      return dir;
    }
    // Not seen: hold the last direction, then ease back to the stance.
    const m = this.memory[bone];
    if (!m) return REST_DIR[bone];
    const k = clamp((t - m.t - HOLD_MS) / RETURN_MS, 0, 1);
    const d = lerp(m.dir, REST_DIR[bone], smoothstep(k));
    const n = Math.hypot(d.x, d.y, d.z) || 1;
    return v(d.x / n, d.y / n, d.z / n);
  }
}
