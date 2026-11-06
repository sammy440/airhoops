import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildWeather } from "./weather3d";

const tex = () => new THREE.Texture();
const points = (w: NonNullable<ReturnType<typeof buildWeather>>) => {
  const a = ((w.object as THREE.Points).geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
  return Array.from({ length: a.length / 3 }, (_, i) => new THREE.Vector3(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]));
};
/** How far each particle moved sideways, the short way round the 24 m box it wraps in (median). */
const driftX = (a: THREE.Vector3[], b: THREE.Vector3[]) => {
  const d = a.map((p, i) => ((b[i].x - p.x + 36) % 24) - 12).sort((x, y) => x - y);
  return d[d.length >> 1];
};

describe("weather", () => {
  it("is outdoors only, and off with reduced motion", () => {
    expect(buildWeather("arena", { tex, calm: false })).toBeNull();
    expect(buildWeather("park", { tex, calm: true })).toBeNull();
    for (const t of ["park", "beach", "rooftop", "neon"] as const) expect(buildWeather(t, { tex, calm: false })).not.toBeNull();
  });

  it.each(["park", "beach", "rooftop", "neon"] as const)("%s: blows with the wind and stays round the court", (theme) => {
    const w = buildWeather(theme, { tex, calm: false })!;
    w.update(0, 0);
    const before = points(w);
    // Half a second of a strong wind to the right blows them right (and the opposite wind, left)
    for (let t = 0.05; t <= 0.5; t += 0.05) w.update(t, 1.2);
    expect(driftX(before, points(w))).toBeGreaterThan(0.5);
    const mid = points(w);
    for (let t = 0.55; t <= 1; t += 0.05) w.update(t, -1.2);
    expect(driftX(mid, points(w))).toBeLessThan(-0.5);
    // A long gale and rain later, everything is still in its box
    for (let t = 1; t < 60; t += 0.1) w.update(t, -1.2);
    for (const p of points(w)) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(12.5);
      expect(p.y).toBeGreaterThanOrEqual(-1.5);
      expect(p.y).toBeLessThanOrEqual(15);
    }
    expect(() => w.dispose()).not.toThrow();
  });

  it("holds still while the game is paused (the clock stands still)", () => {
    const w = buildWeather("rooftop", { tex, calm: false })!;
    w.update(1, 0.5);
    w.update(1.05, 0.5);
    const frozen = points(w).map((p) => p.toArray());
    for (let i = 0; i < 10; i++) w.update(1.05, 0.5);
    expect(points(w).map((p) => p.toArray())).toEqual(frozen);
  });

  it("only shows blowing sand when there's a wind", () => {
    const w = buildWeather("beach", { tex, calm: false })!;
    const m = (w.object as THREE.Points).material as THREE.PointsMaterial;
    w.update(0, 0);
    const calmAir = m.opacity;
    w.update(0.1, 1.2);
    expect(m.opacity).toBeGreaterThan(calmAir * 5);
  });
});
