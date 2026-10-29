import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import { elevationAngle, jointAngle, KinematicsTracker, shoulderWidth, SHOULDER_TO_TORSO, torsoLength } from "./kinematics";
import { LM } from "./landmarks";

const FRAME_MS = 1000 / 30;
const ASPECT = 16 / 9;

/**
 * Builds a pose in *square* units (fraction of frame height), then converts
 * x back to MediaPipe's width-normalized coords, like a real 16:9 camera.
 */
function pose(points: Partial<Record<number, [number, number]>>): NormalizedLandmark[] {
  const p: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }));
  for (const [i, [x, y]] of Object.entries(points) as [string, [number, number]][]) {
    p[+i] = { x: x / ASPECT, y, z: 0, visibility: 1 };
  }
  return p;
}

/**
 * Shoulders at y=0.4, hips at y=0.8 → torso length 0.4.
 * `halfWidth` = half the shoulder width (0.1 facing camera; shrinks side-on).
 */
const body = (lw: [number, number], scale = 1, opts: { rw?: [number, number]; halfWidth?: number; hips?: boolean } = {}) => {
  const { rw = [0.9, 0.7], halfWidth = 0.1, hips = true } = opts;
  const cx = 0.9;
  const pts: Partial<Record<number, [number, number]>> = {
    [LM.LEFT_SHOULDER]: [cx - halfWidth, 0.4],
    [LM.RIGHT_SHOULDER]: [cx + halfWidth, 0.4],
    [LM.LEFT_ELBOW]: [0.8, 0.55],
    [LM.RIGHT_ELBOW]: [1.0, 0.55],
    [LM.LEFT_WRIST]: lw,
    [LM.RIGHT_WRIST]: rw,
  };
  if (hips) {
    pts[LM.LEFT_HIP] = [cx - halfWidth * 0.8, 0.8];
    pts[LM.RIGHT_HIP] = [cx + halfWidth * 0.8, 0.8];
  }
  for (const k in pts) pts[k] = [pts[k]![0] * scale, pts[k]![1] * scale];
  return pose(pts);
};

describe("geometry helpers", () => {
  it("measures distances in square units, not stretched by aspect", () => {
    expect(shoulderWidth(body([0.8, 0.7]), ASPECT)).toBeCloseTo(0.2, 6);
    expect(torsoLength(body([0.8, 0.7]), ASPECT)).toBeCloseTo(0.4, 6);
  });

  it("computes joint angles", () => {
    expect(jointAngle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(180);
    expect(jointAngle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 })).toBeCloseTo(90);
  });

  it("reports elevation regardless of left/right direction", () => {
    expect(elevationAngle({ x: 1, y: -1 })).toBeCloseTo(45);
    expect(elevationAngle({ x: -1, y: -1 })).toBeCloseTo(45);
    expect(elevationAngle({ x: 1, y: 1 })).toBeCloseTo(-45);
  });
});

describe("KinematicsTracker", () => {
  /** Moves the left wrist along a straight line at `vx, vy` (square units/s, before scaling). */
  function run(vx: number, vy: number, scale = 1, opts: { halfWidth?: number } = {}, frames = 10) {
    const k = new KinematicsTracker();
    let last = null;
    for (let i = 0; i < frames; i++) {
      const t = i * FRAME_MS;
      const s = t / 1000;
      last = k.update(body([0.8 + vx * s, 0.7 + vy * s], scale, opts), t, ASPECT, "left");
    }
    return last!;
  }

  it("reports wrist speed in torso lengths per second", () => {
    // 0.6 units/s with a 0.4-unit torso = 1.5 torso/s
    const f = run(0.6, 0);
    expect(f.arms.left!.speed).toBeCloseTo(1.5, 2);
    expect(f.arms.left!.angle).toBeCloseTo(0, 1);
  });

  it("gives the same normalized speed whatever the player's distance", () => {
    // body() scales the whole figure (wrist path included) by `scale`.
    const near = run(0.6, -0.6, 1).arms.left!.speed;
    const far = run(0.6, -0.6, 0.5).arms.left!.speed;
    expect(far).toBeCloseTo(near, 2);
  });

  it("is not thrown off when the player turns side-on (shoulders overlap)", () => {
    const facing = run(0.6, -0.6, 1, { halfWidth: 0.1 }).arms.left!.speed;
    const sideOn = run(0.6, -0.6, 1, { halfWidth: 0.005 }).arms.left!.speed;
    expect(sideOn).toBeCloseTo(facing, 2);
  });

  it("measures throw elevation from the velocity direction", () => {
    expect(run(0.6, -0.6).arms.left!.angle).toBeCloseTo(45, 0);
  });

  it("measures extension, elbow angle and wrist height in torso lengths", () => {
    const k = new KinematicsTracker();
    // Arm straight down: shoulder (0.8,0.4) → elbow (0.8,0.55) → wrist (0.8,0.7)
    const arm = k.update(body([0.8, 0.7]), 0, ASPECT)!.arms.left!;
    expect(arm.extension).toBeCloseTo(0.75, 5);
    expect(arm.elbowAngle).toBeCloseTo(180, 3);
    expect(arm.height).toBeCloseTo(-0.75, 5); // wrist below shoulder
    expect(arm.belowHip).toBeCloseTo(-0.25, 5); // wrist above the hip line
  });

  it("seeds the scale from shoulder width until hips are seen, then holds it if they leave", () => {
    const k = new KinematicsTracker();
    expect(k.update(body([0.8, 0.7], 1, { hips: false }), 0, ASPECT)!.scale).toBeCloseTo(0.2 * SHOULDER_TO_TORSO, 5);

    const k2 = new KinematicsTracker();
    for (let i = 0; i < 60; i++) k2.update(body([0.8, 0.7]), i * FRAME_MS, ASPECT);
    const held = k2.update(body([0.8, 0.7], 1, { hips: false }), 60 * FRAME_MS, ASPECT)!.scale;
    expect(held).toBeCloseTo(0.4, 3);
  });

  it("auto-detects the throwing hand from activity", () => {
    const k = new KinematicsTracker();
    let f = null;
    for (let i = 0; i < 40; i++) {
      const t = i * FRAME_MS;
      // Left hand still; right hand swinging hard around shoulder height.
      const rw: [number, number] = [0.9 + Math.sin(i / 2) * 0.15, 0.42];
      f = k.update(body([0.8, 0.7], 1, { rw }), t, ASPECT, "auto");
    }
    expect(f!.autoHand).toBe("right");
    expect(f!.hand).toBe("right");
  });

  it("doesn't hand the shot to a hand that's dribbling low", () => {
    const k = new KinematicsTracker();
    let f = null;
    for (let i = 0; i < 60; i++) {
      // Right hand pats up and down at the waist (wrist 0.5–0.9 torso below the shoulder).
      const rw: [number, number] = [1.0, 0.7 + Math.sin(i / 1.5) * 0.08];
      f = k.update(body([0.8, 0.3], 1, { rw }), i * FRAME_MS, ASPECT, "auto");
    }
    expect(f!.autoHand).toBe("right"); // the default: dribbling didn't switch anything…
    const k2 = new KinematicsTracker();
    for (let i = 0; i < 30; i++) k2.update(body([0.8 + Math.sin(i / 2) * 0.15, 0.4], 1, { rw: [1.0, 0.7] }), i * FRAME_MS, ASPECT, "auto");
    for (let i = 30; i < 90; i++) {
      const rw: [number, number] = [1.0, 0.7 + Math.sin(i / 1.5) * 0.08];
      f = k2.update(body([0.8, 0.4], 1, { rw }), i * FRAME_MS, ASPECT, "auto");
    }
    expect(f!.autoHand).toBe("left"); // …and a left-handed shooter stays left while dribbling right
  });

  it("never produces NaN on random noisy poses", () => {
    const k = new KinematicsTracker();
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 300; i++) {
      const p: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({ x: rnd(), y: rnd(), z: rnd(), visibility: rnd() }));
      const f = k.update(p, i * FRAME_MS, ASPECT);
      for (const arm of [f?.arms.left, f?.arms.right]) {
        if (!arm) continue;
        for (const v of [arm.speed, arm.angle, arm.elbowAngle, arm.extension, arm.height, arm.velocity.x, arm.velocity.y]) {
          expect(Number.isFinite(v)).toBe(true);
        }
      }
    }
  });
});
