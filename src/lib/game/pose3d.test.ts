import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import type { Vec3 } from "./engine";
import { liveBody, restBody, SHIN_M, STAND, THIGH_M, type Skeleton } from "./pose3d";

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

describe("liveBody (camera)", () => {
  it("needs the shoulders", () => {
    const p = pose();
    p[11].visibility = 0.1;
    expect(liveBody(p)).toBeNull();
  });

  it("both shoulders at the standing spot, right shoulder on the right", () => {
    const b = liveBody(pose())!;
    expect(b.live).toBe(true);
    expect(b.pts[11].x).toBeCloseTo(STAND.x, 6);
    expect(b.pts[12].x).toBeCloseTo(STAND.x, 6);
    expect(b.pts[12].z).toBeGreaterThan(0);
    expect(b.pts[11].z).toBeLessThan(0);
    expect(b.pts[16].y).toBeGreaterThan(b.pts[12].y); // hands up
    legsKeepTheirLength(b.pts);
  });

  it("bent knees seen by the camera lower the whole body; legs stay the right length", () => {
    const straight = liveBody(pose({ legs: true }))!;
    const bent = liveBody(pose({ legs: true, bend: 0.6 }))!;
    expect(straight.pts[11].y).toBeCloseTo(STAND.y, 2);
    expect(bent.pts[11].y).toBeLessThan(straight.pts[11].y - 0.05);
    expect(bent.pts[25].x).toBeGreaterThan(straight.pts[25].x); // knees further forward
    legsKeepTheirLength(bent.pts);
  });

  it("hands down (dribbling height) stay below the shoulders", () => {
    const b = liveBody(pose({ wristsUp: false }))!;
    expect(b.pts[15].y).toBeLessThan(b.pts[11].y);
    expect(b.pts[15].x).toBeCloseTo(STAND.x, 6); // no forward reach for low hands
  });
});
