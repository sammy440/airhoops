import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import type { Vec3 } from "./engine";
import { BONES, restBody, Retargeter, SHIN_M, STAND, THIGH_M, type Skeleton } from "./pose3d";

const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function legsKeepTheirLength(s: Skeleton, grounded = true) {
  for (const [hip, knee, ankle] of [
    [23, 25, 27],
    [24, 26, 28],
  ] as const) {
    expect(dist(s[hip], s[knee])).toBeCloseTo(THIGH_M, 3);
    expect(dist(s[knee], s[ankle])).toBeCloseTo(SHIN_M, 3);
    if (grounded) expect(s[ankle].y).toBeCloseTo(0.08, 6);
    else expect(s[ankle].y).toBeGreaterThanOrEqual(0.08);
    expect(s[knee].x).toBeGreaterThanOrEqual(s[hip].x); // knees bend forward, never backward
  }
}

/**
 * A player square to a 16:9 camera (image coords), knees bent by `bend` (0 = straight).
 * `legs`: whether knees and ankles are in view.
 */
function pose({ bend = 0, legs = false, wristsUp = true } = {}): NormalizedLandmark[] {
  const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }));
  const set = (i: number, x: number, y: number, z = 0, visibility = 0.95) => (p[i] = { x, y, z, visibility });
  set(0, 0.5, 0.22);
  set(11, 0.56, 0.32); // their left: image right
  set(12, 0.44, 0.32);
  set(13, 0.58, wristsUp ? 0.22 : 0.42);
  set(14, 0.42, wristsUp ? 0.22 : 0.42);
  set(15, 0.53, wristsUp ? 0.1 : 0.52);
  set(16, 0.47, wristsUp ? 0.1 : 0.52);
  set(23, 0.53, 0.6);
  set(24, 0.47, 0.6);
  if (legs) {
    // Hip → ankle 0.5 of the frame straight down; a bend pushes the knee sideways in the image and shortens it.
    const k = 0.25 * Math.cos(bend);
    const out = 0.25 * Math.sin(bend) / (16 / 9);
    set(25, 0.53 + out, 0.6 + k);
    set(26, 0.47 - out, 0.6 + k);
    set(27, 0.53, 0.6 + 2 * k);
    set(28, 0.47, 0.6 + 2 * k);
  }
  return p;
}

describe("restBody (no camera)", () => {
  it("holds the set and keeps its legs on the floor", () => {
    const b = restBody(null, null);
    expect(b.live).toBe(false);
    expect(b.pts[16].y).toBeGreaterThan(2); // ball over the head
    legsKeepTheirLength(b.pts);
  });

  it("sinks into the legs while charging", () => {
    const b = restBody(null, 1);
    expect(b.pts[11].y).toBeLessThan(restBody(null, null).pts[11].y - 0.1);
    legsKeepTheirLength(b.pts);
  });

  it("releases, follows through, then comes back to the set", () => {
    const set = restBody(null, null).pts;
    const through = restBody(0.5, null).pts;
    expect(through[16].y).toBeGreaterThan(set[16].y + 0.3); // shooting arm extended up
    expect(through[20].y).toBeLessThan(through[16].y); // wrist flicked: fingers below the wrist
    expect(restBody(1.5, null).pts[16]).toEqual(set[16]);
    const hop = restBody(0.25, null).pts;
    legsKeepTheirLength(hop, false);
    expect(hop[27].y).toBeGreaterThan(0.08); // feet off the floor at the top of the hop
  });
});

describe("Retargeter (camera)", () => {
  const armLengths = (b: Skeleton) => [dist(b[11], b[13]), dist(b[13], b[15]), dist(b[12], b[14]), dist(b[14], b[16])];
  const expectProportions = (b: Skeleton) => {
    const [lu, lf, ru, rf] = armLengths(b);
    expect(lu).toBeCloseTo(BONES.upperArm, 6);
    expect(ru).toBeCloseTo(BONES.upperArm, 6);
    expect(lf).toBeCloseTo(BONES.forearm, 6);
    expect(rf).toBeCloseTo(BONES.forearm, 6);
    expect(dist(b[11], b[12])).toBeCloseTo(2 * BONES.shoulderHalf, 6);
    legsKeepTheirLength(b);
  };
  /** The same pose, moved in the frame and scaled (standing closer = bigger). */
  const placed = (p: NormalizedLandmark[], dx: number, k: number) => p.map((l) => ({ ...l, x: 0.5 + (l.x - 0.5) * k + dx, y: 0.5 + (l.y - 0.5) * k }));

  it("needs the shoulders", () => {
    const p = pose();
    p[11].visibility = 0.1;
    expect(new Retargeter().body(p, 0)).toBeNull();
  });

  it("keeps the avatar's proportions, with the right shoulder on the right", () => {
    const b = new Retargeter().body(pose(), 0)!;
    expect(b.live).toBe(true);
    expectProportions(b.pts);
    expect(b.pts[12].z).toBeGreaterThan(0);
    expect(b.pts[11].z).toBeLessThan(0);
    expect(b.pts[16].y).toBeGreaterThan(b.pts[12].y); // hands up
  });

  it("is the same body standing too close, off to the side, or half out of frame", () => {
    const base = new Retargeter().body(pose(), 0)!.pts;
    for (const [dx, k] of [
      [0.25, 1],
      [-0.2, 1.8],
      [0, 0.5],
    ]) {
      const b = new Retargeter().body(placed(pose(), dx, k), 0)!.pts;
      expectProportions(b);
      for (const j of [11, 12, 13, 14, 15, 16] as const) {
        expect(b[j].y).toBeCloseTo(base[j].y, 6);
        expect(b[j].z).toBeCloseTo(base[j].z, 6);
      }
    }
    // Hips leave the frame (too close): the scale learned before carries on.
    const r = new Retargeter();
    r.body(pose(), 0);
    const close = pose();
    close[23].visibility = close[24].visibility = 0;
    expectProportions(r.body(close, 33)!.pts);
  });

  it("an arm that looks short is pointing at the camera: it reaches forward, not shrinks", () => {
    const p = pose();
    // Upper arm and forearm seen end-on: elbow and wrist almost on top of the shoulder
    p[14] = { ...p[12], x: p[12].x - 0.005, y: p[12].y - 0.01 };
    p[16] = { ...p[12], x: p[12].x - 0.01, y: p[12].y - 0.02 };
    const b = new Retargeter().body(p, 0)!.pts;
    expectProportions(b);
    expect(b[16].x - b[12].x).toBeGreaterThan(0.5); // most of the arm's length, forwards
  });

  it("leans with the player, within reason", () => {
    const p = pose();
    for (const i of [0, 11, 12, 13, 14, 15, 16, 19, 20]) p[i] = { ...p[i], x: p[i].x - 0.03 }; // upper body to the image's left = the player's right
    const b = new Retargeter().body(p, 0)!.pts;
    expect((b[11].z + b[12].z) / 2).toBeGreaterThan(0.05);
    for (const i of [0, 11, 12, 13, 14, 15, 16, 19, 20]) p[i] = { ...p[i], x: p[i].x - 0.3 }; // absurd
    const far = new Retargeter().body(p, 0)!.pts;
    expect((far[11].z + far[12].z) / 2).toBeLessThanOrEqual(0.15 + 1e-9);
  });

  it("a joint the camera loses holds its direction, then eases back to the stance", () => {
    const r = new Retargeter();
    const up = r.body(pose(), 0)!.pts;
    const lost = pose();
    lost[14].visibility = lost[16].visibility = 0;
    const held = r.body(lost, 300)!.pts;
    expect(held[16].y).toBeCloseTo(up[16].y, 6);
    const back = r.body(lost, 2000)!.pts;
    const stance = restBody(null, null).pts;
    expect(back[16].y - back[12].y).toBeCloseTo(stance[16].y - stance[12].y, 6);
    expectProportions(back);
  });

  it("hands down (dribbling height) stay below the shoulders", () => {
    const b = new Retargeter().body(pose({ wristsUp: false }), 0)!.pts;
    expect(b[15].y).toBeLessThan(b[11].y);
    expectProportions(b);
  });

  it("bent knees seen by the camera lower the whole body; legs stay the right length", () => {
    const straight = new Retargeter().body(pose({ legs: true }), 0)!.pts;
    const bent = new Retargeter().body(pose({ legs: true, bend: 0.6 }), 0)!.pts;
    expect(straight[11].y).toBeCloseTo(STAND.y, 2);
    expect(bent[11].y).toBeLessThan(straight[11].y - 0.05);
    expect(bent[25].x).toBeGreaterThan(straight[25].x); // knees further forward
    legsKeepTheirLength(bent);
  });
});
