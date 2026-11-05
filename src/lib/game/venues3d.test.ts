import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { COURT_THEME_ORDER } from "./courts";
import { COURTS_3D } from "./courts3d";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "./difficulty";
import { buildVenue, CLEAR } from "./venues3d";

// No DOM here: textures are blank stand-ins.
const tex = () => new THREE.Texture();

/** A solid's footprint in the venue frame (xf beyond the hoop, zr to the right). */
const footprint = (b: THREE.Box3) => ({ xf: [-b.max.z, -b.min.z], zr: [b.min.x, b.max.x], top: b.max.y });

/** Distance from a point to a rectangle (0 inside). */
const dist = (px: number, pz: number, r: { xf: number[]; zr: number[] }) =>
  Math.hypot(Math.max(r.xf[0] - px, 0, px - r.xf[1]), Math.max(r.zr[0] - pz, 0, pz - r.zr[1]));

/**
 * The farthest the camera gets from its orbit centre: the portrait base view (5.2 m behind the
 * release spot, 2.75 m up, 0.9 m right) zoomed all the way out (×1.9), as in game3d.ts.
 */
function orbit(d: number) {
  const target = { xf: 0.55 * d - d, y: 2.05 };
  const r = Math.hypot(0.55 * d + 5.2, 2.75 - 2.05, 0.9 - 0.1) * 1.9;
  return { cx: target.xf, r };
}

describe.each(COURT_THEME_ORDER)("venue %s", (theme) => {
  const venue = buildVenue(theme, { tex, palette: COURTS_3D[theme], calm: false, font: "sans-serif" });

  it("keeps the court and the space round it clear of anything solid", () => {
    const blocking = venue.solids
      .map((s) => ({ name: s.name, ...footprint(s.box) }))
      .filter((s) => s.top > 0.05 && s.xf[1] > CLEAR.xfMin && s.xf[0] < CLEAR.xfMax && s.zr[1] > -CLEAR.zrHalf && s.zr[0] < CLEAR.zrHalf);
    expect(blocking).toEqual([]);
  });

  it.each(DIFFICULTY_ORDER)("leaves the camera's orbit free of anything taller than a bench (%s)", (id) => {
    const { cx, r } = orbit(DIFFICULTIES[id].distance);
    const inOrbit = venue.solids
      .map((s) => ({ name: s.name, ...footprint(s.box) }))
      .filter((s) => s.top > 1.3 && dist(cx, 0, s) < r)
      .map((s) => `${s.name} at ${s.xf.map((v) => v.toFixed(1))} / ${s.zr.map((v) => v.toFixed(1))}`);
    expect(inOrbit).toEqual([]);
  });

  it("stays within a small draw-call budget", () => {
    let draws = 0;
    venue.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) draws++;
    });
    expect(draws).toBeLessThan(60);
  });

  it("animates and cleans up", () => {
    expect(() => {
      for (const t of [0, 0.5, 12, 300]) venue.update(t, t < 1 ? 0.2 : Infinity);
      venue.dispose();
    }).not.toThrow();
  });
});

it("builds the same venue every time (seeded)", () => {
  const a = buildVenue("park", { tex, palette: COURTS_3D.park, calm: false, font: "sans-serif" });
  const b = buildVenue("park", { tex, palette: COURTS_3D.park, calm: false, font: "sans-serif" });
  expect(a.solids.map((s) => s.box.min.toArray())).toEqual(b.solids.map((s) => s.box.min.toArray()));
});
