import { describe, expect, it } from "vitest";
import { OneEuroFilter, PoseSmoother } from "./oneEuroFilter";

const FRAME_MS = 1000 / 30;

/** Deterministic pseudo-random noise in [-1, 1]. */
function noise(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647) * 2 - 1;
  };
}

const variance = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
};

describe("OneEuroFilter", () => {
  it("returns the first sample unchanged", () => {
    expect(new OneEuroFilter(1, 0).filter(0.42, 0)).toBe(0.42);
  });

  it("removes most jitter from a still signal", () => {
    const f = new OneEuroFilter(1, 1.5);
    const rnd = noise(7);
    const raw: number[] = [];
    const out: number[] = [];
    for (let i = 0; i < 120; i++) {
      const x = 0.5 + rnd() * 0.01;
      raw.push(x);
      out.push(f.filter(x, i * FRAME_MS));
    }
    expect(variance(out.slice(20))).toBeLessThan(variance(raw.slice(20)) * 0.2);
  });

  it("follows fast motion with less lag when beta is higher", () => {
    const lagFor = (beta: number) => {
      const f = new OneEuroFilter(1, beta);
      let y = 0;
      // Wrist sweeping 3 units/s, like a throw.
      for (let i = 0; i <= 10; i++) y = f.filter(i * FRAME_MS * 0.003, i * FRAME_MS);
      return 10 * FRAME_MS * 0.003 - y;
    };
    expect(lagFor(5)).toBeLessThan(lagFor(0) * 0.5);
  });

  it("survives duplicate timestamps without producing NaN", () => {
    const f = new OneEuroFilter(1, 1.5);
    f.filter(0.1, 100);
    expect(Number.isFinite(f.filter(0.2, 100))).toBe(true);
  });
});

describe("PoseSmoother", () => {
  const pose = (x: number) => Array.from({ length: 33 }, () => ({ x, y: 0.5, z: 0, visibility: 1 }));

  it("only smooths the requested landmarks", () => {
    const s = new PoseSmoother([15]);
    s.apply(pose(0.2), 0);
    const out = s.apply(pose(0.8), FRAME_MS)!;
    expect(out[15].x).toBeGreaterThan(0.2);
    expect(out[15].x).toBeLessThan(0.8);
    expect(out[0].x).toBe(0.8);
  });

  it("restarts after a tracking gap instead of gliding from stale data", () => {
    const s = new PoseSmoother([15]);
    s.apply(pose(0.2), 0);
    expect(s.apply(pose(0.8), 1000)![15].x).toBe(0.8);
  });
});
