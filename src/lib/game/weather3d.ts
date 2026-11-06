import * as THREE from "three";
import type { CourtThemeId } from "./courts";
import type { TextureMaker } from "./venues3d";

/**
 * Weather round the 3D court, blown by the game's crosswind, so the wind the flag shows
 * is in the air too: leaves at the park, sand off the beach, rain on the rooftop, glowing
 * motes on the neon grid. The arena is indoors.
 *
 * Particles live in a box round the court and the camera (the hoop's frame, three.js axes:
 * +x = the shooter's right, −z = beyond the hoop), and wrap round it. Positions update on
 * the CPU each frame: a few hundred points is nothing next to pose tracking.
 */

export interface Weather {
  object: THREE.Object3D;
  /** `t`: game clock (s), so a pause freezes it. `wind`: crosswind (m/s², + = right). */
  update(t: number, wind: number): void;
  dispose(): void;
}

interface Kind {
  count: number;
  /** Box the particles fill: x (right), y (up), z (three.js z: + = towards the shooter) */
  box: { x: [number, number]; y: [number, number]; z: [number, number] };
  /** Fall speed range (m/s, + = down) */
  fall: [number, number];
  /** Sideways drift per m/s² of wind (m/s) */
  drift: number;
  /** Side-to-side sway (m/s), for things that flutter */
  sway: number;
  colors: string[];
  size: number;
  opacity: number;
  /** Streaks (rain) instead of dots */
  streak?: number;
  additive?: boolean;
  /** Only shows in a wind (sand): opacity scales with its strength */
  windOnly?: boolean;
}

/** Round the court and back past the camera's orbit. */
const AROUND = { x: [-12, 12] as [number, number], z: [-6, 18] as [number, number] };

const KINDS: Partial<Record<CourtThemeId, Kind>> = {
  park: { count: 110, box: { ...AROUND, y: [0, 9] }, fall: [0.5, 1.1], drift: 2.2, sway: 0.6, colors: ["#d98a2b", "#e8b33c", "#b5562a", "#7fa04a"], size: 0.3, opacity: 1 },
  beach: { count: 600, box: { ...AROUND, y: [0, 2.2] }, fall: [-0.05, 0.08], drift: 6, sway: 0.15, colors: ["#fffaf0", "#fff1d6"], size: 0.14, opacity: 1, windOnly: true },
  rooftop: { count: 700, box: { ...AROUND, y: [-1, 14] }, fall: [11, 15], drift: 3, sway: 0, colors: ["#9fb6d6"], size: 0, opacity: 0.32, streak: 0.045 },
  neon: { count: 160, box: { ...AROUND, y: [0, 10] }, fall: [-0.45, -0.15], drift: 1.4, sway: 0.25, colors: ["#38f3ff", "#ff4fd8", "#b98cff"], size: 0.18, opacity: 0.9, additive: true },
};

/** A soft round dot (leaves, sand and motes are drawn as these). */
const dot = (tex: TextureMaker) =>
  tex(32, 32, (ctx) => {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.55, "rgba(255,255,255,0.85)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  });

/** The weather for a court, or null where there's none (indoors) or motion is reduced. */
export function buildWeather(theme: CourtThemeId, o: { tex: TextureMaker; calm: boolean; seed?: number }): Weather | null {
  const kind = KINDS[theme];
  if (!kind || o.calm) return null;
  let a = (o.seed ?? 7) >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const { count, box } = kind;
  const span = (r: [number, number]) => r[0] + rand() * (r[1] - r[0]);

  // Each particle: position, its own fall speed and sway phase
  const pos = new Float32Array(count * 3);
  const fall = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([span(box.x), span(box.y), span(box.z)], i * 3);
    fall[i] = span(kind.fall);
    phase[i] = rand() * Math.PI * 2;
  }

  const verts = kind.streak ? count * 2 : count;
  const geo = new THREE.BufferGeometry();
  const draw = new Float32Array(verts * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(draw, 3).setUsage(THREE.DynamicDrawUsage));
  const colors = new Float32Array(verts * 3);
  const c = new THREE.Color();
  for (let i = 0; i < verts; i++) {
    c.set(kind.colors[Math.floor(rand() * kind.colors.length)]);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  // The box moves with nothing: one bound for culling, never recomputed
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6, 6), 30);

  const blending = kind.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
  const map = kind.streak ? null : dot(o.tex);
  const material = kind.streak
    ? new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: kind.opacity, depthWrite: false, blending })
    : new THREE.PointsMaterial({ map, vertexColors: true, size: kind.size, sizeAttenuation: true, transparent: true, opacity: kind.opacity, depthWrite: false, alphaTest: 0.02, blending });
  const object = kind.streak ? new THREE.LineSegments(geo, material) : new THREE.Points(geo, material);
  object.name = `weather-${theme}`;
  object.frustumCulled = false;

  const wrap = (v: number, r: [number, number]) => {
    const w = r[1] - r[0];
    return v < r[0] ? v + w : v > r[1] ? v - w : v;
  };
  let last: number | null = null;

  const write = (wind: number) => {
    for (let i = 0; i < count; i++) {
      const [x, y, z] = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
      if (!kind.streak) {
        draw.set([x, y, z], i * 3);
        continue;
      }
      // A streak along the drop's velocity: slanted by the wind
      const vx = wind * kind.drift;
      draw.set([x, y, z, x - vx * kind.streak, y + fall[i] * kind.streak, z], i * 6);
    }
    geo.attributes.position.needsUpdate = true;
  };
  write(0);

  return {
    object,
    update(t, wind) {
      const dt = last === null ? 0 : Math.min(0.1, Math.max(0, t - last));
      last = t;
      if (kind.windOnly) material.opacity = kind.opacity * Math.min(1, 0.08 + Math.abs(wind) / 0.8);
      if (dt === 0) return;
      for (let i = 0; i < count; i++) {
        const j = i * 3;
        const sway = kind.sway * Math.sin(t * 1.7 + phase[i]);
        pos[j] = wrap(pos[j] + (wind * kind.drift + sway) * dt, box.x);
        pos[j + 1] = wrap(pos[j + 1] - fall[i] * dt, box.y);
        pos[j + 2] = wrap(pos[j + 2] + sway * 0.4 * dt, box.z);
      }
      write(wind);
    },
    dispose() {
      geo.dispose();
      material.dispose();
      map?.dispose();
    },
  };
}
