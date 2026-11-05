import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { CourtThemeId } from "./courts";
import type { Court3D } from "./courts3d";

/**
 * The world around each 3D court: an arena bowl, a city park on a street, a beach at sunset,
 * a rooftop above the skyline, a synthwave grid.
 *
 * Everything is laid out in a frame centred on the hoop (on the floor), in metres:
 * `xf` beyond the hoop (negative = towards the shooter), `zr` to the shooter's right, `y` up.
 * The court and the camera's orbit stay clear (see `CLEAR` and venues3d.test.ts); the richest
 * scenery sits beyond the hoop, where the default view looks.
 *
 * Kept cheap (pose tracking shares the machine): static scenery is merged into one mesh per
 * material, crowds are instanced, lighting is the scene's existing hemisphere + sun, and
 * everything is built once per court change.
 */

/** Makes a canvas texture (injected, so tests can build venues without a DOM). */
export type TextureMaker = (w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) => THREE.Texture;

export interface VenueOptions {
  tex: TextureMaker;
  palette: Court3D;
  /** Reduced motion: scenery holds still */
  calm: boolean;
  font: string;
}

export interface Venue {
  group: THREE.Group;
  /** Fog near / far for this venue (metres) */
  fog: [number, number];
  /** Opaque things, as boxes in the group's frame (three.js axes): for the clear-zone test */
  solids: { name: string; box: THREE.Box3 }[];
  /** `t` in seconds; `sinceMake` seconds since the last make (Infinity if none) */
  update(t: number, sinceMake: number): void;
  dispose(): void;
}

/** The court (and the space just round it) that only flat things may touch, in the venue frame. */
export const CLEAR = { xfMin: -13, xfMax: 3.4, zrHalf: 8.3 };

/** Venue frame → three.js, in the group's local space (physics (x, y, z) → three (z, y, −x)). */
const V = (xf: number, y: number, zr: number) => new THREE.Vector3(zr, y, -xf);
const UP = new THREE.Vector3(0, 1, 0);
const M = (xf: number, y: number, zr: number, ry = 0, s: [number, number, number] = [1, 1, 1]) =>
  new THREE.Matrix4().compose(V(xf, y, zr), new THREE.Quaternion().setFromAxisAngle(UP, ry), new THREE.Vector3(...s));

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type SolidOpt = { color?: THREE.ColorRepresentation; solid?: string | false };

/** Builder: merged batches per material, owned GPU resources, per-frame tickers. */
class Kit {
  readonly group = new THREE.Group();
  readonly solids: Venue["solids"] = [];
  readonly rnd: () => number;
  private batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private owned: { dispose(): void }[] = [];
  private tickers: ((t: number, sinceMake: number) => void)[] = [];

  constructor(
    readonly o: VenueOptions,
    seed: number,
  ) {
    this.rnd = rng(seed);
  }

  r(a: number, b: number) {
    return a + (b - a) * this.rnd();
  }
  pick<T>(xs: readonly T[]) {
    return xs[Math.floor(this.rnd() * xs.length)];
  }
  own<T extends { dispose(): void }>(x: T) {
    this.owned.push(x);
    return x;
  }
  tex(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void, repeat = false) {
    const t = this.own(this.o.tex(w, h, paint));
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  lambert(p: THREE.MeshLambertMaterialParameters = {}) {
    return this.own(new THREE.MeshLambertMaterial(p));
  }
  basic(p: THREE.MeshBasicMaterialParameters = {}) {
    return this.own(new THREE.MeshBasicMaterial(p));
  }

  /** Adds `geo`, placed by `m`, to the merged mesh for `mat` (tinted by `color`). Opaque by default. */
  put(mat: THREE.Material, geo: THREE.BufferGeometry, m: THREE.Matrix4, opt: SolidOpt = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    g.applyMatrix4(m);
    const c = new THREE.Color(opt.color ?? 0xffffff);
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    if (opt.solid !== false) {
      g.computeBoundingBox();
      this.solids.push({ name: opt.solid ?? "solid", box: g.boundingBox!.clone() });
    }
    (mat as THREE.MeshBasicMaterial).vertexColors = true;
    const list = this.batches.get(mat) ?? [];
    list.push(g);
    this.batches.set(mat, list);
  }

  /** A box standing on `y` (w across, d in depth, h up), turned `ry` about the vertical. */
  box(mat: THREE.Material, w: number, h: number, d: number, xf: number, y: number, zr: number, opt: SolidOpt & { ry?: number; geo?: THREE.BufferGeometry } = {}) {
    this.put(mat, opt.geo ?? new THREE.BoxGeometry(w, h, d), M(xf, y + h / 2, zr, opt.ry), opt);
  }

  /** An upright cylinder standing on `y`. */
  cyl(mat: THREE.Material, rTop: number, rBottom: number, h: number, xf: number, y: number, zr: number, opt: SolidOpt & { seg?: number } = {}) {
    this.put(mat, new THREE.CylinderGeometry(rTop, rBottom, h, opt.seg ?? 8), M(xf, y + h / 2, zr), opt);
  }

  /** A thin rod between two points (venue frame). Never counts as solid. */
  rod(mat: THREE.Material, r: number, a: [number, number, number], b: [number, number, number], color?: THREE.ColorRepresentation) {
    const pa = V(...a);
    const pb = V(...b);
    const dir = new THREE.Vector3().subVectors(pb, pa);
    const len = dir.length();
    const m = new THREE.Matrix4().compose(
      pa.clone().addScaledVector(dir, 0.5),
      new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()),
      new THREE.Vector3(1, len, 1),
    );
    this.put(mat, new THREE.CylinderGeometry(r, r, 1, 6), m, { color, solid: false });
  }

  /** A flat rectangle on the ground (y), `w` across, `d` deep. */
  flat(mat: THREE.Material, w: number, d: number, xf: number, y: number, zr: number, color?: THREE.ColorRepresentation) {
    const g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
    this.put(mat, g, M(xf, y, zr), { color, solid: false });
  }

  /** A standalone object (animated, or with its own material). Its resources are owned. */
  add<T extends THREE.Object3D>(obj: T, solid?: string) {
    this.group.add(obj);
    obj.traverse((x) => {
      const mesh = x as THREE.Mesh;
      if (mesh.geometry) this.own(mesh.geometry);
    });
    if (solid) {
      obj.updateMatrixWorld(true);
      this.solids.push({ name: solid, box: new THREE.Box3().setFromObject(obj) });
    }
    return obj;
  }

  tick(fn: (t: number, sinceMake: number) => void) {
    this.tickers.push(fn);
  }

  finish(fog: [number, number]): Venue {
    for (const [mat, geos] of this.batches) {
      const merged = this.own(mergeGeometries(geos)!);
      for (const g of geos) g.dispose();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
    this.batches.clear();
    const calm = this.o.calm;
    return {
      group: this.group,
      fog,
      solids: this.solids,
      update: (t, sinceMake) => {
        for (const fn of this.tickers) fn(calm ? 0 : t, calm ? Infinity : sinceMake);
      },
      dispose: () => {
        for (const x of this.owned) x.dispose();
        this.owned = [];
      },
    };
  }
}

/* ───────── Shared pieces ───────── */

/** Building facades: a 4×4 tile of windows, repeated (one window every 2.6 m, a floor every 3.2 m). */
const FACADE = { cellW: 4 * 2.6, cellH: 4 * 3.2 };

/** A box whose sides repeat the facade texture at real scale; the roof gets the plain wall colour. */
function facadeGeo(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const spans = [d, d, 0, 0, w, w]; // px, nx, py (roof), ny, pz, nz
  for (let f = 0; f < 6; f++)
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      if (!spans[f]) uv.setXY(k, 0.01, 0.01);
      else uv.setXY(k, (uv.getX(k) * spans[f]) / FACADE.cellW, (uv.getY(k) * h) / FACADE.cellH);
    }
  return g;
}

function windowsTexture(k: Kit, o: { wall: string; lit: string[]; dark: string; litRatio: number; seed: number }) {
  return k.tex(
    256,
    256,
    (ctx) => {
      const r = rng(o.seed);
      ctx.fillStyle = o.wall;
      ctx.fillRect(0, 0, 256, 256);
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 4; col++) {
          ctx.fillStyle = r() < o.litRatio ? o.lit[Math.floor(r() * o.lit.length)] : o.dark;
          ctx.fillRect(col * 64 + 12, row * 64 + 14, 40, 36);
          ctx.fillStyle = "rgba(0,0,0,0.18)";
          ctx.fillRect(col * 64 + 10, row * 64 + 50, 44, 4);
        }
    },
    true,
  );
}

function noiseTexture(k: Kit, base: string, speck: string, seed: number, n = 900) {
  return k.tex(
    256,
    256,
    (ctx) => {
      const r = rng(seed);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = speck;
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = 0.15 + r() * 0.35;
        ctx.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3);
      }
      ctx.globalAlpha = 1;
    },
    true,
  );
}

/** A soft round glow for sprites (sun, moon, lamps). */
function glowTexture(k: Kit, inner: string, outer: string) {
  return k.tex(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, inner);
    g.addColorStop(0.35, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

/** Sky things (sun, moon): drawn without fog, far away, never in front of the court. */
function skySprite(k: Kit, map: THREE.Texture, xf: number, y: number, zr: number, size: number, additive = false) {
  const s = new THREE.Sprite(
    k.own(new THREE.SpriteMaterial({ map, fog: false, depthWrite: false, transparent: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending })),
  );
  s.position.copy(V(xf, y, zr));
  s.scale.setScalar(size);
  s.renderOrder = -1;
  return k.add(s);
}

function stars(k: Kit, count: number, color = "#ffffff") {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = k.r(0, Math.PI * 2);
    const el = Math.asin(k.r(0.08, 1));
    const p = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).multiplyScalar(700);
    pos.set([p.x, p.y, p.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, k.own(new THREE.PointsMaterial({ color, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 })));
  pts.renderOrder = -2;
  return k.add(pts);
}

/** The court surface and the ground round it. */
function surfaces(k: Kit, court: { color: string; xf: [number, number]; zr: number }, ground: THREE.Material | null, groundY = -0.02) {
  const slab = k.lambert({ color: "#ffffff" });
  const [x0, x1] = court.xf;
  k.flat(slab, court.zr * 2, x1 - x0, (x0 + x1) / 2, 0, 0, court.color);
  if (ground) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), ground);
    g.position.set(0, groundY, 0);
    k.add(g);
  }
}

/** A chain-link fence along a straight line, `h` tall: posts, top rail and see-through mesh. */
function fence(k: Kit, mesh: THREE.Material, metal: THREE.Material, a: [number, number], b: [number, number], h: number, y = 0) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // A plane facing across the line: in three.js, rotate about y so its width runs from a to b.
  const ry = Math.atan2(-(b[0] - a[0]), b[1] - a[1]);
  const g = new THREE.PlaneGeometry(len, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / 1.2, (uv.getY(i) * h) / 1.2);
  k.put(mesh, g, M(mid[0], y + h / 2, mid[1], ry), { solid: false });
  const posts = Math.max(1, Math.round(len / 3));
  for (let i = 0; i <= posts; i++) {
    const u = i / posts;
    const xf = a[0] + (b[0] - a[0]) * u;
    const zr = a[1] + (b[1] - a[1]) * u;
    k.rod(metal, 0.04, [xf, y, zr], [xf, y + h + 0.05, zr]);
  }
  k.rod(metal, 0.03, [a[0], y + h, a[1]], [b[0], y + h, b[1]]);
}

function chainLink(k: Kit, color: string) {
  const map = k.tex(
    64,
    64,
    (ctx) => {
      ctx.clearRect(0, 0, 64, 64);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 32);
      ctx.lineTo(32, 0);
      ctx.lineTo(64, 32);
      ctx.lineTo(32, 64);
      ctx.closePath();
      ctx.stroke();
    },
    true,
  );
  return k.lambert({ map, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide });
}

/** A palm: a curved trunk and drooping fronds, as two geometries (trunk, crown) at the origin. */
function palmGeometry(fronds = 8) {
  const trunk: THREE.BufferGeometry[] = [];
  const crown: THREE.BufferGeometry[] = [];
  let p = new THREE.Vector3(0, 0, 0);
  const segs = 7;
  for (let i = 0; i < segs; i++) {
    const u = (i + 1) / segs;
    const next = new THREE.Vector3(0.9 * u * u, u * 8, 0);
    const dir = new THREE.Vector3().subVectors(next, p);
    const g = new THREE.CylinderGeometry(0.2 - 0.07 * u, 0.24 - 0.07 * u, dir.length(), 7);
    g.applyMatrix4(new THREE.Matrix4().compose(p.clone().addScaledVector(dir, 0.5), new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()), new THREE.Vector3(1, 1, 1)));
    trunk.push(g.toNonIndexed());
    p = next;
  }
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2;
    // A long flat leaf, drooping outward from the top of the trunk
    const leaf = new THREE.ConeGeometry(0.55, 4.2, 4, 1).scale(1, 1, 0.18).toNonIndexed();
    leaf.translate(0, 2.1, 0);
    leaf.rotateZ(-1.15 - (i % 2) * 0.25);
    leaf.rotateY(a);
    leaf.translate(p.x, p.y, p.z);
    crown.push(leaf);
  }
  return { trunk: mergeGeometries(trunk)!, crown: mergeGeometries(crown)! };
}

/** Palms at the given spots (venue frame), instanced: one draw for the trunks, one for the crowns. */
function palms(k: Kit, spots: [number, number][], trunkMat: THREE.Material, crownMat: THREE.Material, sway = true) {
  const geo = palmGeometry();
  const trunks = new THREE.InstancedMesh(geo.trunk, trunkMat, spots.length);
  const crowns = new THREE.InstancedMesh(geo.crown, crownMat, spots.length);
  const base = spots.map(([xf, zr]) => ({ xf, zr, ry: k.r(0, Math.PI * 2), s: k.r(0.85, 1.3), ph: k.r(0, 6) }));
  const place = (t: number) => {
    base.forEach((b, i) => {
      const lean = sway ? Math.sin(t * 0.8 + b.ph) * 0.02 : 0;
      const m = new THREE.Matrix4().compose(V(b.xf, 0, b.zr), new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, b.ry, lean)), new THREE.Vector3(b.s, b.s, b.s));
      trunks.setMatrixAt(i, m);
      crowns.setMatrixAt(i, m);
    });
    trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true;
  };
  place(0);
  for (const b of base) {
    k.solids.push({ name: "palm", box: new THREE.Box3().setFromCenterAndSize(V(b.xf, 4.5 * b.s, b.zr), new THREE.Vector3(1.2, 9 * b.s, 1.2)) });
    // The crown: fronds reach about 4 m out at full size
    k.solids.push({ name: "palm crown", box: new THREE.Box3().setFromCenterAndSize(V(b.xf + 0.9 * b.s, 7.6 * b.s, b.zr), new THREE.Vector3(8 * b.s, 2.4 * b.s, 8 * b.s)) });
  }
  k.add(trunks);
  k.add(crowns);
  if (sway) k.tick((t) => place(t));
}

/**
 * Spots for tall things: outside the camera's orbit (17.2 m round the orbit centre, plus `reach`, how far
 * the thing spreads from its spot: a tree's crown, a palm's fronds) and off the `avoid` boxes.
 */
function scatter(
  k: Kit,
  n: number,
  area: { xf: [number, number]; zr: [number, number] },
  avoid: { xf: [number, number]; zr: [number, number] }[] = [],
  gap = 3,
  reach = 1,
) {
  const out: [number, number][] = [];
  for (let tries = 0; out.length < n && tries < n * 60; tries++) {
    const xf = k.r(...area.xf);
    const zr = k.r(...area.zr);
    if (Math.hypot(xf + 3.1, zr) < 17.5 + reach) continue;
    if (avoid.some((a) => xf > a.xf[0] && xf < a.xf[1] && zr > a.zr[0] && zr < a.zr[1])) continue;
    if (out.some(([x, z]) => Math.hypot(x - xf, z - zr) < gap)) continue;
    out.push([xf, zr]);
  }
  return out;
}

/** A banner / sign texture: bold text on a colour. */
function signTexture(k: Kit, w: number, h: number, bg: string, fg: string, text: string, size: number) {
  return k.tex(w, h, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.font = `700 ${size}px ${k.o.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2);
  });
}

/* ───────── Night Arena ───────── */

function arena(k: Kit): Venue {
  const p = k.o.palette;
  surfaces(k, { color: p.floor, xf: [-14, 6], zr: 10.5 }, k.lambert({ color: "#2a1a12" }));

  // The bowl: tiered stands on four sides, each row a step up and back
  const stand = k.lambert({ color: "#ffffff" });
  const ROWS = 12;
  const RISE = 0.45;
  const DEPTH = 0.85;
  type Side = { line: number; along: [number, number]; axis: "xf" | "zr"; out: 1 | -1 };
  const sides: Side[] = [
    { line: 15, along: [-16, 16], axis: "xf", out: 1 }, // behind the hoop
    { line: -22, along: [-16, 16], axis: "xf", out: -1 }, // behind the shooter
    { line: -17.2, along: [-21, 14], axis: "zr", out: -1 }, // left
    { line: 17.2, along: [-21, 14], axis: "zr", out: 1 }, // right
  ];
  const seats: { xf: number; zr: number; y: number; s: number }[] = [];
  for (const s of sides) {
    const len = s.along[1] - s.along[0];
    const mid = (s.along[0] + s.along[1]) / 2;
    for (let r = 0; r < ROWS; r++) {
      const off = s.line + s.out * (r * DEPTH + DEPTH / 2);
      const top = 0.6 + r * RISE;
      const tint = r % 4 === 3 ? "#7a2f1c" : r % 2 ? "#2b1f1a" : "#33251e";
      if (s.axis === "xf") k.box(stand, len, top, DEPTH, off, 0, mid, { color: tint, solid: "stand" });
      else k.box(stand, DEPTH, top, len, mid, 0, off, { color: tint, solid: "stand" });
      for (let a = s.along[0] + 0.4; a < s.along[1] - 0.3; a += 0.56) {
        if (k.rnd() < 0.13) continue; // an empty seat
        const at = s.axis === "xf" ? { xf: off, zr: a } : { xf: a, zr: off };
        seats.push({ ...at, y: top, s: a });
      }
    }
  }

  // The crowd: a body and a head per seat, instanced; they bounce, and cheer on a make
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.55, 0.32), k.lambert({ color: "#ffffff" }), seats.length);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), k.lambert({ color: "#ffffff" }), seats.length);
  const shirts = ["#c8623a", "#f2efe6", "#2f6a3f", "#d9b44a", "#3a5a8c", "#1d1d1c", "#9c3b2a", "#e07a4a"];
  const skins = ["#f1c9a5", "#d9a37a", "#b97c55", "#8d5a3b", "#5e3b26"];
  const phase = seats.map(() => k.r(0, Math.PI * 2));
  const m = new THREE.Matrix4();
  seats.forEach((s, i) => {
    bodies.setMatrixAt(i, m.makeTranslation(V(s.xf, s.y + 0.28, s.zr)));
    heads.setMatrixAt(i, m.makeTranslation(V(s.xf, s.y + 0.68, s.zr)));
    bodies.setColorAt(i, new THREE.Color(k.pick(shirts)));
    heads.setColorAt(i, new THREE.Color(k.pick(skins)));
  });
  k.add(bodies);
  k.add(heads);
  let lastCrowd = -1;
  k.tick((t, sinceMake) => {
    if (t - lastCrowd < 1 / 30) return; // 30 Hz is plenty for a crowd
    lastCrowd = t;
    const cheer = sinceMake < 3 ? Math.exp(-sinceMake) : 0;
    const bArr = bodies.instanceMatrix.array as Float32Array;
    const hArr = heads.instanceMatrix.array as Float32Array;
    for (let i = 0; i < seats.length; i++) {
      const lift = Math.max(0, Math.sin(t * 2 + phase[i])) * 0.04 + cheer * Math.max(0, Math.sin(t * 9 + phase[i])) * 0.3;
      bArr[i * 16 + 13] = seats[i].y + 0.28 + lift;
      hArr[i * 16 + 13] = seats[i].y + 0.68 + lift;
    }
    bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  });

  // Walls and roof of the hall, with a ring of lit suites above the stands
  const shell = k.lambert({ color: "#ffffff" });
  const H = 20;
  k.box(shell, 60, H, 1, 27, 0, 0, { color: "#160d0a" });
  k.box(shell, 60, H, 1, -34, 0, 0, { color: "#160d0a" });
  k.box(shell, 1, H, 62, -3.5, 0, -29, { color: "#160d0a" });
  k.box(shell, 1, H, 62, -3.5, 0, 29, { color: "#160d0a" });
  k.box(shell, 60, 0.5, 62, -3.5, H, 0, { color: "#0e0907", solid: false });
  const suites = k.basic({ color: "#ffffff" });
  k.box(suites, 58, 1.1, 0.2, 26.3, 8.4, 0, { color: "#b07a4c", solid: false });
  k.box(suites, 58, 1.1, 0.2, -33.3, 8.4, 0, { color: "#b07a4c", solid: false });
  k.box(suites, 0.2, 1.1, 60, -3.5, 8.4, -28.3, { color: "#b07a4c", solid: false });
  k.box(suites, 0.2, 1.1, 60, -3.5, 8.4, 28.3, { color: "#b07a4c", solid: false });

  // LED boards along the sidelines and behind the baseline, scrolling
  const ledMap = k.tex(
    1024,
    64,
    (ctx) => {
      ctx.fillStyle = "#120a07";
      ctx.fillRect(0, 0, 1024, 64);
      ctx.font = `700 34px ${k.o.font}`;
      ctx.textBaseline = "middle";
      const words = ["AIRHOOPS", "SWISH", "NOTHING BUT AIR", "SHOOT YOUR SHOT"];
      let x = 20;
      for (let i = 0; x < 1024; i++) {
        ctx.fillStyle = i % 2 ? "#f7f1d6" : "#e8743f";
        const w = words[i % words.length];
        ctx.fillText(w, x, 34);
        x += ctx.measureText(w).width + 28;
        ctx.fillStyle = "#e8a33d";
        ctx.fillText("•", x - 20, 34);
      }
    },
    true,
  );
  const led = k.basic({ map: ledMap });
  const ledBoard = (len: number, xf: number, zr: number, ry: number) => {
    const g = new THREE.PlaneGeometry(len, 0.9);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / 12);
    k.put(led, g, M(xf, 0.45, zr, ry), { solid: "led" });
  };
  ledBoard(16, -4, -9.6, Math.PI / 2);
  ledBoard(16, -4, 9.6, -Math.PI / 2);
  ledBoard(14, 6.5, 0, 0);
  if (!k.o.calm) k.tick((t) => (ledMap.offset.x = (t * 0.06) % 1));

  // Jumbotron over the court, hanging from the roof
  const jumboMap = k.tex(512, 320, (ctx) => {
    ctx.fillStyle = "#0b0706";
    ctx.fillRect(0, 0, 512, 320);
    ctx.fillStyle = "#c8623a";
    ctx.fillRect(14, 14, 484, 6);
    ctx.fillRect(14, 300, 484, 6);
    ctx.fillStyle = "#f7f1d6";
    ctx.font = `700 92px ${k.o.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("AIRHOOPS", 256, 140);
    ctx.font = `600 34px ${k.o.font}`;
    ctx.fillStyle = "#e8a33d";
    ctx.fillText("SHOOT YOUR SHOT", 256, 230);
  });
  const jumbo = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.8, 6.4), k.lambert({ color: "#1b1310" }));
  jumbo.add(frame);
  const screenMat = k.basic({ map: jumboMap });
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.5), screenMat);
    s.rotation.y = (i * Math.PI) / 2;
    s.position.set(Math.sin((i * Math.PI) / 2) * 3.21, 0, Math.cos((i * Math.PI) / 2) * 3.21);
    jumbo.add(s);
  }
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.45, 32, 1, true), k.basic({ color: "#e8743f", side: THREE.DoubleSide }));
  ring.position.y = -2.2;
  jumbo.add(ring);
  jumbo.position.copy(V(-4, 13.5, 0));
  k.add(jumbo);
  const cable = k.lambert({ color: "#333333" });
  for (const [dx, dz] of [
    [-2.5, -2.5],
    [2.5, 2.5],
    [-2.5, 2.5],
    [2.5, -2.5],
  ])
    k.rod(cable, 0.03, [-4 + dx, 15.4, dz], [-4 + dx, H, dz]);

  // Light rigs: trusses under the roof, cones of light onto the floor
  const truss = k.lambert({ color: "#3a3a3a" });
  for (const xf of [-12, -4, 4]) k.box(truss, 40, 0.5, 0.5, xf, H - 1.5, 0, { solid: false });
  const beam = k.basic({ color: "#ffd9a8", transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  for (const [xf, zr] of [
    [-12, -6],
    [-12, 6],
    [-4, -8],
    [-4, 8],
    [4, -5],
    [4, 5],
  ]) {
    const g = new THREE.ConeGeometry(3.4, H - 1.5, 20, 1, true);
    k.put(beam, g, M(xf, (H - 1.5) / 2, zr), { solid: false });
    k.cyl(truss, 0.35, 0.45, 0.6, xf, H - 2.2, zr, { solid: false });
  }

  // Banners from the rafters behind the hoop
  const banners: [string, string, string][] = [
    ["#c8623a", "#f7f1d6", "23"],
    ["#2f6a3f", "#f7f1d6", "AH"],
    ["#f7f1d6", "#c8623a", "'26"],
    ["#2f6a3f", "#f7f1d6", "SWISH"],
    ["#c8623a", "#f7f1d6", "11"],
  ];
  banners.forEach(([bg, fg, text], i) => {
    const mat = k.basic({ map: signTexture(k, 128, 256, bg, fg, text, text.length > 3 ? 34 : 70) });
    const b = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.8), mat);
    b.position.copy(V(26.3, 13, -10 + i * 5));
    b.rotation.y = 0;
    k.add(b);
  });

  return k.finish([30, 80]);
}

/* ───────── Park Day ───────── */

function vehicle(k: Kit, mats: { body: THREE.Material; glass: THREE.Material; wheel: THREE.Material }, o: { len: number; h: number; w: number; bus?: boolean }) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(o.len, o.bus ? o.h : o.h * 0.55, o.w), mats.body);
  body.position.y = 0.35 + (o.bus ? o.h / 2 : (o.h * 0.55) / 2);
  g.add(body);
  if (o.bus) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(o.len * 0.92, 0.9, o.w + 0.02), mats.glass);
    band.position.y = 0.35 + o.h * 0.62;
    g.add(band);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(o.len * 0.55, o.h * 0.45, o.w * 0.9), mats.glass);
    cabin.position.set(-o.len * 0.05, 0.35 + o.h * 0.55 + (o.h * 0.45) / 2, 0);
    g.add(cabin);
  }
  // All four wheels in one mesh (one draw per vehicle part)
  const wheels: THREE.BufferGeometry[] = [];
  for (const x of [-o.len * 0.33, o.len * 0.33]) for (const z of [-o.w / 2, o.w / 2]) wheels.push(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 12).rotateX(Math.PI / 2).translate(x, 0.34, z));
  g.add(new THREE.Mesh(mergeGeometries(wheels)!, mats.wheel));
  for (const w of wheels) w.dispose();
  return g;
}

function park(k: Kit): Venue {
  const p = k.o.palette;
  const grass = k.lambert({ map: noiseTexture(k, "#79b04f", "#4f8a35", 11) });
  (grass.map as THREE.Texture).repeat.set(160, 160);
  surfaces(k, { color: p.floor, xf: [-16, 5.5], zr: 10 }, grass);

  // Fence round the blacktop (see-through), benches outside it
  const link = chainLink(k, "#9aa3ab");
  const metal = k.lambert({ color: "#ffffff" });
  const F = 3.6;
  fence(k, link, metal, [-16, -10], [-16, 10], F);
  fence(k, link, metal, [5.5, -10], [5.5, 10], F);
  fence(k, link, metal, [-16, -10], [5.5, -10], F);
  fence(k, link, metal, [-16, 10], [5.5, 10], F);
  const wood = k.lambert({ color: "#ffffff" });
  for (const [xf, zr] of [
    [-10, -11.4],
    [-2, -11.4],
    [-10, 11.4],
    [-2, 11.4],
  ]) {
    k.box(wood, 0.5, 0.08, 2.2, xf, 0.45, zr, { color: "#8a5a3a", solid: "bench" });
    k.box(wood, 0.08, 0.45, 2.2, xf, 0.55, zr + Math.sign(zr) * 0.25, { color: "#8a5a3a", solid: "bench" });
    k.box(metal, 0.4, 0.45, 0.08, xf, 0, zr, { color: "#3a3f45", solid: "bench" });
  }

  // The street beyond the hoop: sidewalks with a curb, two lanes, markings
  const concrete = k.lambert({ map: noiseTexture(k, "#c9c6bf", "#9a978f", 12, 500) });
  (concrete.map as THREE.Texture).repeat.set(100, 1);
  k.flat(concrete, 400, 4, 10.5, 0.12, 0);
  k.flat(concrete, 400, 4, 26.5, 0.12, 0);
  const curb = k.lambert({ color: "#ffffff" });
  k.box(curb, 400, 0.12, 0.25, 12.4, 0, 0, { color: "#b5b2aa", solid: false });
  k.box(curb, 400, 0.12, 0.25, 24.6, 0, 0, { color: "#b5b2aa", solid: false });
  const roadMap = k.tex(
    64,
    256,
    (ctx) => {
      ctx.fillStyle = "#3b3d42";
      ctx.fillRect(0, 0, 64, 256);
      ctx.fillStyle = "#e8c24a";
      ctx.fillRect(30, 0, 4, 140); // dashed centre line
      ctx.fillStyle = "#e9e9e4";
      ctx.fillRect(1, 0, 2, 256);
      ctx.fillRect(61, 0, 2, 256);
    },
    true,
  );
  roadMap.repeat.set(1, 40);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(12, 400).rotateX(-Math.PI / 2).rotateY(Math.PI / 2), k.lambert({ map: roadMap }));
  road.position.copy(V(18.5, 0.02, 0));
  k.add(road);

  // Lamp posts and a bus stop on the near sidewalk
  const pole = k.lambert({ color: "#ffffff" });
  const bulb = k.basic({ color: "#fff4d6" });
  for (let zr = -60; zr <= 60; zr += 20) {
    k.rod(pole, 0.08, [9.6, 0, zr], [9.6, 5.5, zr], "#2f353b");
    k.rod(pole, 0.05, [9.6, 5.5, zr], [11, 5.7, zr], "#2f353b");
    k.box(bulb, 0.5, 0.18, 0.3, 11, 5.5, zr, { solid: false });
  }
  const glass = k.lambert({ color: "#bfe0f0", transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  k.box(pole, 4.2, 0.12, 1.8, 10.6, 2.6, 15, { color: "#2f6a3f", solid: "bus stop" });
  k.box(glass, 4, 2.4, 0.05, 9.8, 0.2, 15, { solid: false });
  k.box(wood, 3, 0.08, 0.5, 10.1, 0.5, 15, { color: "#8a5a3a", solid: "bus stop" });
  k.rod(pole, 0.05, [12, 0, 12.2], [12, 3, 12.2], "#2f353b");
  k.box(k.basic({ map: signTexture(k, 128, 128, "#2f6a3f", "#ffffff", "BUS", 46) }), 0.7, 0.7, 0.05, 12, 2.7, 12.2, { solid: false, ry: Math.PI / 2 });

  // Across the street: shops on the ground floor, flats above, in a row
  const flats = k.lambert({ map: windowsTexture(k, { wall: "#ffffff", lit: ["#a9c9dd", "#8fb3c9"], dark: "#57707f", litRatio: 0.5, seed: 21 }) });
  const shopMap = k.tex(
    256,
    64,
    (ctx) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = "#3d5866";
      ctx.fillRect(16, 10, 150, 44);
      ctx.fillRect(186, 14, 50, 50);
    },
    true,
  );
  const shop = k.lambert({ map: shopMap });
  const walls = ["#c97b5d", "#efe3cf", "#a8b89a", "#d9a35b", "#9fb3c6", "#e7c9b8", "#b85c48"];
  const awnings = ["#c8623a", "#2f6a3f", "#e8a33d", "#3a5a8c", "#f2efe6"];
  const row = (xf0: number, from: number, to: number, depth: [number, number], hRange: [number, number], ry = 0, alongXf = false) => {
    for (let a = from; a < to; ) {
      const w = k.r(8, 15);
      const h = Math.round(k.r(...hRange) / 3.2) * 3.2 + 3.6;
      const d = k.r(...depth);
      const wall = k.pick(walls);
      const c = a + w / 2;
      const [xf, zr] = alongXf ? [c, xf0 + Math.sign(xf0) * (d / 2)] : [xf0 + Math.sign(xf0) * (d / 2), c];
      const [bw, bd] = alongXf ? [d, w] : [w, d];
      k.box(flats, bw, h - 3.6, bd, xf, 3.6, zr, { color: wall, geo: facadeGeo(bw, h - 3.6, bd), ry });
      const sg = new THREE.BoxGeometry(bw, 3.6, bd);
      const uv = sg.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * Math.max(bw, bd)) / 8);
      k.box(shop, bw, 3.6, bd, xf, 0, zr, { color: wall, geo: sg, ry });
      // Awning over the shopfront, on the street side
      if (!alongXf && xf0 > 0) k.box(curb, w * 0.8, 0.15, 1.4, xf0 - 0.6, 3.1, c, { color: k.pick(awnings), solid: false });
      a += w + k.r(0, 1.5);
    }
  };
  row(28.5, -140, 140, [10, 16], [6, 18]);
  // Further off on the other three sides, so the park sits in a neighbourhood
  row(-62, -140, 140, [12, 18], [10, 30]);
  row(-52, -60, 6, [12, 18], [12, 34], 0, true);
  row(52, -60, 6, [12, 18], [12, 34], 0, true);

  // Trees round the park (out of the street and the camera's way)
  const trunkMat = k.lambert({ color: "#ffffff" });
  const leaves = k.lambert({ color: "#ffffff", flatShading: true });
  const street = { xf: [7, 29] as [number, number], zr: [-200, 200] as [number, number] };
  const spots = scatter(k, 46, { xf: [-48, 26], zr: [-48, 48] }, [street, { xf: [-17, 6.5], zr: [-11, 11] }], 4.5, 3.4);
  for (const [xf, zr] of spots) {
    const s = k.r(0.8, 1.35);
    k.cyl(trunkMat, 0.18 * s, 0.26 * s, 3 * s, xf, 0, zr, { color: "#6b4a32", solid: "tree" });
    const g = new THREE.IcosahedronGeometry(2.3 * s, 1);
    k.put(leaves, g, M(xf, 3 * s + 1.6 * s, zr, k.r(0, 3)), { color: k.pick(["#4d8a3a", "#5d9c45", "#3f7a33", "#6aa84f"]), solid: "tree" });
  }

  // Traffic: cars both ways, and a bus that stops at the stop
  const tyre = k.lambert({ color: "#1c1c1c" });
  const tint = k.lambert({ color: "#28363f" });
  const cars: { g: THREE.Group; lane: number; dir: 1 | -1; speed: number; off: number }[] = [];
  const paints = ["#c8623a", "#f2efe6", "#2f6a3f", "#3a5a8c", "#1d1d1c", "#d9b44a", "#9aa3ab"];
  for (let i = 0; i < 7; i++) {
    const dir = i % 2 ? 1 : -1;
    const g = k.add(vehicle(k, { body: k.lambert({ color: k.pick(paints) }), glass: tint, wheel: tyre }, { len: 4.3, h: 1.5, w: 1.85 }));
    if (dir < 0) g.rotation.y = Math.PI;
    cars.push({ g, lane: dir > 0 ? 16.6 : 21.5, dir, speed: k.r(8, 12), off: k.r(0, 260) });
  }
  const busBand = k.lambert({ map: windowsTexture(k, { wall: "#1f2a30", lit: ["#9ec3d6"], dark: "#9ec3d6", litRatio: 1, seed: 5 }) });
  const bus = k.add(vehicle(k, { body: k.lambert({ color: "#e8a33d" }), glass: busBand, wheel: tyre }, { len: 11.5, h: 2.7, w: 2.5, bus: true }));
  const L = 260;
  k.tick((t) => {
    for (const c of cars) {
      const s = ((t * c.speed + c.off) % L) - L / 2;
      c.g.position.copy(V(c.lane, 0.02, c.dir * s));
    }
    // The bus: drives the lane, pauses 5 s at the stop (zr 15), then carries on
    const speed = 7;
    const toStop = 15 + L / 2;
    const cycle = L / speed + 5;
    const u = t % cycle;
    const run = u < toStop / speed ? u * speed : u < toStop / speed + 5 ? toStop : (u - 5) * speed;
    bus.position.copy(V(14.2, 0.02, run - L / 2));
  });

  // Clouds drifting high up
  const puff = k.tex(128, 64, (ctx) => {
    const r = rng(77);
    for (let i = 0; i < 14; i++) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 22);
      g.addColorStop(0, "rgba(255,255,255,0.9)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.save();
      ctx.translate(20 + r() * 88, 26 + r() * 18);
      ctx.fillStyle = g;
      ctx.fillRect(-22, -22, 44, 44);
      ctx.restore();
    }
  });
  const clouds = Array.from({ length: 9 }, (_, i) => {
    const s = new THREE.Sprite(k.own(new THREE.SpriteMaterial({ map: puff, fog: false, depthWrite: false, transparent: true })));
    s.scale.set(k.r(60, 110), k.r(26, 40), 1);
    const base = { xf: k.r(-150, 250), y: k.r(70, 120), zr: k.r(-300, 300), i };
    s.position.copy(V(base.xf, base.y, base.zr));
    k.add(s);
    return { s, base };
  });
  k.tick((t) => {
    for (const c of clouds) c.s.position.copy(V(c.base.xf, c.base.y, ((c.base.zr + t * 1.5 + 300) % 600) - 300));
  });

  return k.finish([70, 320]);
}

/* ───────── Sunset Beach ───────── */

function beach(k: Kit): Venue {
  const p = k.o.palette;
  const sand = k.lambert({ map: noiseTexture(k, "#e9cf9f", "#c7a46e", 31, 1400) });
  (sand.map as THREE.Texture).repeat.set(140, 140);
  surfaces(k, { color: p.floor, xf: [-11.5, 4.5], zr: 9.5 }, sand);
  const border = k.lambert({ color: "#ffffff" });
  // A low wooden edge round the court, like a beach court's boards
  for (const [w, d, xf, zr] of [
    [19.4, 0.25, -11.6, 0],
    [19.4, 0.25, 4.6, 0],
    [0.25, 16.4, -3.5, -9.6],
    [0.25, 16.4, -3.5, 9.6],
  ] as const)
    k.box(border, w, 0.04, d, xf, 0, zr, { color: "#8a5a3a", solid: false });

  // Wet sand, surf and the sea beyond the hoop
  const wet = k.lambert({ color: "#ffffff" });
  k.flat(wet, 1600, 8, 24, -0.01, 0, "#b99a6c");
  const seaMap = k.tex(
    8,
    256,
    (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, "#d98a7c"); // far: the sky's glow on the water
      g.addColorStop(0.5, "#6b5d93");
      g.addColorStop(1, "#2f6f86"); // near: teal shallows
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 8, 256);
    },
  );
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 700).rotateX(-Math.PI / 2), k.basic({ map: seaMap }));
  sea.position.copy(V(28 + 350, -0.03, 0));
  k.add(sea);
  const ripples = k.tex(
    256,
    256,
    (ctx) => {
      const r = rng(41);
      ctx.clearRect(0, 0, 256, 256);
      ctx.strokeStyle = "rgba(255,230,210,0.5)";
      for (let i = 0; i < 70; i++) {
        const x = r() * 256;
        const y = r() * 256;
        ctx.lineWidth = 1 + r() * 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 10 + r() * 30, y);
        ctx.stroke();
      }
    },
    true,
  );
  ripples.repeat.set(40, 18);
  const glint = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 700).rotateX(-Math.PI / 2),
    k.basic({ map: ripples, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glint.position.copy(V(28 + 350, -0.01, 0));
  k.add(glint);
  const foamMap = k.tex(
    256,
    32,
    (ctx) => {
      const r = rng(9);
      ctx.clearRect(0, 0, 256, 32);
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`;
        ctx.fillRect(r() * 256, 8 + r() * 16, 2 + r() * 8, 2 + r() * 3);
      }
    },
    true,
  );
  foamMap.repeat.set(60, 1);
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(1600, 3).rotateX(-Math.PI / 2), k.basic({ map: foamMap, transparent: true, depthWrite: false }));
  k.add(foam);
  k.tick((t) => {
    ripples.offset.set((t * 0.004) % 1, (t * 0.01) % 1);
    foamMap.offset.x = (t * 0.003) % 1;
    foam.position.copy(V(28.5 + Math.sin(t * 0.6) * 1.2, 0.01, 0));
  });
  foam.position.copy(V(28.5, 0.01, 0));

  // The sun on the horizon with its path on the water
  skySprite(k, glowTexture(k, "rgba(255,226,150,1)", "rgba(255,140,90,0)"), 520, 26, -60, 90);
  skySprite(k, glowTexture(k, "rgba(255,170,120,0.55)", "rgba(255,120,90,0)"), 520, 26, -60, 320, true);
  const path = k.tex(64, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "rgba(255,200,140,0.9)");
    g.addColorStop(1, "rgba(255,200,140,0)");
    ctx.fillStyle = g;
    for (let y = 0; y < 256; y += 6) ctx.fillRect(32 - (6 + y / 12), y, 12 + y / 6, 3);
  });
  const sunPath = new THREE.Mesh(new THREE.PlaneGeometry(40, 480).rotateX(-Math.PI / 2), k.basic({ map: path, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  sunPath.position.copy(V(280, 0.0, -35));
  sunPath.rotation.y = Math.atan2(60 - 0, 520) * -1;
  k.add(sunPath);

  // Distant headlands either side of the bay
  const hills = k.basic({ color: "#ffffff" });
  for (const [xf, zr, s] of [
    [260, -420, 1],
    [300, 380, 1.3],
    [200, -560, 0.8],
  ] as const) {
    const g = new THREE.ConeGeometry(160 * s, 60 * s, 7, 1).scale(1, 1, 0.5);
    k.put(hills, g, M(xf, 30 * s - 4, zr, 0.4), { color: "#5a4a72", solid: false });
  }

  // Palms round the court, umbrellas and towels on the sand
  const trunkMat = k.lambert({ color: "#7a5a3c" });
  const frondMat = k.lambert({ color: "#3f7d3a", side: THREE.DoubleSide, flatShading: true });
  const palmSpots = scatter(k, 16, { xf: [-30, 20], zr: [-36, 36] }, [{ xf: [-12, 5], zr: [-10, 10] }, { xf: [-28, -20], zr: [-200, 200] }], 6, 5.6);
  palms(k, palmSpots, trunkMat, frondMat, !k.o.calm);
  const cloth = k.lambert({ color: "#ffffff", side: THREE.DoubleSide });
  const umbrellaSpots = scatter(k, 10, { xf: [-14, 20], zr: [-30, 30] }, [{ xf: [-12, 5], zr: [-10, 10] }, ...palmSpots.map(([x, z]) => ({ xf: [x - 2.5, x + 2.5] as [number, number], zr: [z - 2.5, z + 2.5] as [number, number] }))], 5, 1.6);
  const stripes = ["#c8623a", "#2f6a3f", "#e8a33d", "#3a5a8c", "#f2efe6"];
  for (const [xf, zr] of umbrellaSpots) {
    k.rod(cloth, 0.04, [xf, 0, zr], [xf, 2.4, zr], "#eeeeee");
    k.put(cloth, new THREE.ConeGeometry(1.5, 0.55, 10, 1, true), M(xf, 2.35, zr, k.r(0, 3)), { color: k.pick(stripes), solid: "umbrella" });
    k.box(cloth, 0.9, 0.02, 1.8, xf + 1.2, 0, zr + 0.6, { color: k.pick(stripes), solid: false, ry: k.r(-0.4, 0.4) });
  }

  // Lifeguard tower by the water
  const tower = k.lambert({ color: "#ffffff" });
  const [tx, tz] = [17, 21];
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    k.rod(tower, 0.1, [tx + dx, 0, tz + dz], [tx + dx * 0.9, 2.2, tz + dz * 0.9], "#e9e4da");
  k.box(tower, 2.6, 0.15, 2.6, tx, 2.2, tz, { color: "#e9e4da", solid: "tower" });
  k.box(tower, 2.2, 1.8, 2.2, tx, 2.35, tz, { color: "#f3d36b", solid: "tower" });
  k.put(tower, new THREE.ConeGeometry(2, 0.9, 4), M(tx, 4.6, tz, Math.PI / 4), { color: "#c8483a", solid: "tower" });
  k.rod(tower, 0.03, [tx, 5, tz], [tx, 6.6, tz], "#e9e4da");
  k.box(k.basic({ color: "#c8483a", side: THREE.DoubleSide }), 0.8, 0.5, 0.02, tx, 6.05, tz + 0.4, { solid: false });

  // Volleyball net off to the left
  const net = k.lambert({ map: chainLink(k, "#ffffff").map, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
  k.rod(tower, 0.06, [-2, 0, -26], [-2, 2.5, -26], "#e9e4da");
  k.rod(tower, 0.06, [8, 0, -26], [8, 2.5, -26], "#e9e4da");
  k.box(net, 0.02, 1, 10, 3, 1.4, -26, { solid: false });

  // Boardwalk behind the shooter, string lights along it, hotels behind
  const deck = k.lambert({ map: noiseTexture(k, "#9b7350", "#6d4c33", 33, 600) });
  (deck.map as THREE.Texture).repeat.set(80, 2);
  k.box(deck, 400, 0.5, 5, -24.5, 0, 0, { solid: "boardwalk" });
  const rail = k.lambert({ color: "#ffffff" });
  for (const xf of [-22.1, -26.9]) {
    k.box(rail, 400, 0.08, 0.08, xf, 1.45, 0, { color: "#7a5a3c", solid: false });
    for (let zr = -100; zr <= 100; zr += 2.5) k.box(rail, 0.08, 1, 0.08, xf, 0.5, zr, { color: "#7a5a3c", solid: false });
  }
  const bulbs: THREE.Vector3[] = [];
  for (let zr = -100; zr < 100; zr += 12) {
    k.rod(rail, 0.06, [-22.2, 0.5, zr], [-22.2, 4.2, zr], "#3a2c22");
    for (let i = 1; i < 12; i++) {
      const u = i / 12;
      bulbs.push(V(-22.2, 4.1 - Math.sin(u * Math.PI) * 0.9, zr + u * 12));
    }
  }
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), k.basic({ color: "#ffd38a" }), bulbs.length);
  bulbs.forEach((b, i) => lights.setMatrixAt(i, new THREE.Matrix4().makeTranslation(b)));
  k.add(lights);
  const hotels = k.lambert({ map: windowsTexture(k, { wall: "#ffffff", lit: ["#ffd9a0", "#ffc27a", "#ffe8c0"], dark: "#6d6378", litRatio: 0.55, seed: 34 }) });
  const pastel = ["#f2c6b4", "#f7e1b5", "#c9e0d6", "#f0b9a6", "#e8d4ef", "#fbe6cf"];
  for (let zr = -150; zr < 150; ) {
    const w = k.r(14, 26);
    const h = k.r(10, 38);
    const d = k.r(14, 20);
    k.box(hotels, w, h, d, -36 - d / 2, 0, zr + w / 2, { color: k.pick(pastel), geo: facadeGeo(w, h, d) });
    zr += w + k.r(2, 8);
  }

  // Boats on the water
  const hull = k.lambert({ color: "#f2efe6" });
  const sailMat = k.lambert({ color: "#fff8ec", side: THREE.DoubleSide });
  const boats = [0, 1].map((i) => {
    const g = new THREE.Group();
    const h = new THREE.Mesh(new THREE.BoxGeometry(6, 0.9, 2), hull);
    h.position.y = 0.4;
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 7), new THREE.Vector2(3.6, 0)])), sailMat);
    sail.position.set(-1.2, 0.9, 0);
    g.add(h, sail);
    g.scale.setScalar(i ? 0.7 : 1);
    return { g: k.add(g), xf: i ? 210 : 120, speed: i ? 1.2 : 2, off: i ? 90 : 0 };
  });
  k.tick((t) => {
    for (const b of boats) {
      b.g.position.copy(V(b.xf, Math.sin(t * 1.3 + b.off) * 0.15, ((t * b.speed + b.off + 300) % 600) - 300));
      b.g.rotation.x = Math.sin(t * 1.1 + b.off) * 0.04;
    }
  });

  return k.finish([90, 520]);
}

/* ───────── City Rooftop ───────── */

function rooftop(k: Kit): Venue {
  const p = k.o.palette;
  const STREET = -80;
  surfaces(k, { color: p.floor, xf: [-17, 9], zr: 13 }, null);
  // The rest of our roof, a safety-orange border, then the parapet and a fence on top
  const roof = k.lambert({ color: "#ffffff" });
  k.flat(roof, 26, 0.6, 8.7, 0.004, 0, "#c8623a");
  k.flat(roof, 26, 0.6, -16.7, 0.004, 0, "#c8623a");
  k.flat(roof, 0.6, 26, -4, 0.004, -12.7, "#c8623a");
  k.flat(roof, 0.6, 26, -4, 0.004, 12.7, "#c8623a");
  const parapet = k.lambert({ color: "#ffffff" });
  k.box(parapet, 26.7, 1.1, 0.35, 9.2, 0, 0, { color: "#4a4e57", solid: "parapet" });
  k.box(parapet, 26.7, 1.1, 0.35, -17.2, 0, 0, { color: "#4a4e57", solid: "parapet" });
  k.box(parapet, 0.35, 1.1, 26.4, -4, 0, -13.2, { color: "#4a4e57", solid: "parapet" });
  k.box(parapet, 0.35, 1.1, 26.4, -4, 0, 13.2, { color: "#4a4e57", solid: "parapet" });
  // Our building below the roof, down to the street
  // (its top stops just under the roof surface, so the two never fight)
  const towerMat = k.basic({ map: windowsTexture(k, { wall: "#1c2433", lit: ["#ffd79a", "#cfe4ff"], dark: "#121826", litRatio: 0.4, seed: 51 }) });
  const towerH = -STREET - 0.05;
  k.box(towerMat, 26.4, towerH, 26, -4, STREET, 0, { color: "#9aa6bb", geo: facadeGeo(26.4, towerH, 26), solid: false });
  const link = chainLink(k, "#b8c4d6");
  const metal = k.lambert({ color: "#ffffff" });
  fence(k, link, metal, [-17.2, -13.2], [-17.2, 13.2], 2.4, 1.1);
  fence(k, link, metal, [9.2, -13.2], [9.2, 13.2], 2.4, 1.1);
  fence(k, link, metal, [-17.2, -13.2], [9.2, -13.2], 2.4, 1.1);
  fence(k, link, metal, [-17.2, 13.2], [9.2, 13.2], 2.4, 1.1);
  // Rooftop units in the corners
  for (const [xf, zr] of [
    [7.2, -11.3],
    [7.2, 11.3],
  ])
    k.box(roof, 1.6, 1.2, 1.2, xf, 0, zr, { color: "#9aa3ad", solid: "hvac" });

  // Floodlights on poles, and festoon lights strung across the court
  const bulbs: THREE.Vector3[] = [];
  const corners: [number, number][] = [
    [8.6, -12.6],
    [8.6, 12.6],
    [-16.6, -12.6],
    [-16.6, 12.6],
  ];
  for (const [xf, zr] of corners) {
    k.rod(metal, 0.07, [xf, 0, zr], [xf, 7, zr], "#2a2f3a");
    k.box(k.basic({ color: "#ffffff" }), 0.7, 0.35, 0.5, xf, 7, zr, { color: "#fff6e0", solid: false });
  }
  const strands: [[number, number], [number, number]][] = [
    [corners[0], corners[3]],
    [corners[1], corners[2]],
    [corners[0], corners[1]],
    [corners[2], corners[3]],
  ];
  for (const [a, b] of strands)
    for (let i = 1; i < 26; i++) {
      const u = i / 26;
      bulbs.push(V(a[0] + (b[0] - a[0]) * u, 6.6 - Math.sin(u * Math.PI) * 1.4, a[1] + (b[1] - a[1]) * u));
    }
  const festoon = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 6, 4), k.basic({ color: "#ffd38a" }), bulbs.length);
  bulbs.forEach((b, i) => festoon.setMatrixAt(i, new THREE.Matrix4().makeTranslation(b)));
  k.add(festoon);

  // The city: blocks of towers on a street grid far below
  const night = k.basic({ map: windowsTexture(k, { wall: "#151c2b", lit: ["#ffd79a", "#ffe9c4", "#cfe4ff", "#9fc6ff"], dark: "#0f1522", litRatio: 0.38, seed: 52 }) });
  const BLOCK = 62;
  const beacons: THREE.Vector3[] = [];
  const tanks: [number, number, number][] = [];
  for (let bx = -6; bx <= 6; bx++)
    for (let bz = -6; bz <= 6; bz++) {
      if (bx === 0 && bz === 0) continue;
      const cx = bx * BLOCK;
      const cz = bz * BLOCK;
      const towers = 1 + Math.floor(k.rnd() * 3);
      for (let i = 0; i < towers; i++) {
        const w = k.r(14, 26);
        const d = k.r(14, 26);
        const xf = cx + k.r(-14, 14);
        const zr = cz + k.r(-14, 14);
        // Height grows with distance: the blocks round us sit below the roof (so you look out over
        // them), then mid-rises, then the downtown towers on the skyline.
        const far = Math.hypot(xf, zr);
        const top = far < 140 ? k.r(-48, -8) : far < 230 ? k.r(-30, 55) : k.r(10, 160);
        const h = top - STREET;
        k.box(night, w, h, d, xf, STREET, zr, { color: k.pick(["#ffffff", "#e6ecff", "#fff1e0", "#dfe6f2"]), geo: facadeGeo(w, h, d) });
        if (top > 60 && k.rnd() < 0.6) beacons.push(V(xf, top + 6, zr));
        if (top > 60 && k.rnd() < 0.6) k.rod(metal, 0.4, [xf, top, zr], [xf, top + 6, zr], "#3a4150");
        if (top < 40 && k.rnd() < 0.25) tanks.push([xf + w / 4, top, zr - d / 4]);
      }
    }
  // Water tanks on a few lower roofs
  const tankMat = k.lambert({ color: "#ffffff" });
  for (const [xf, y, zr] of tanks) {
    for (const [dx, dz] of [
      [-1.2, -1.2],
      [1.2, 1.2],
      [-1.2, 1.2],
      [1.2, -1.2],
    ])
      k.rod(tankMat, 0.12, [xf + dx, y, zr + dz], [xf + dx, y + 3, zr + dz], "#3a3a3a");
    k.cyl(tankMat, 2, 2, 4, xf, y + 3, zr, { color: "#7a5a44", seg: 12 });
    k.put(tankMat, new THREE.ConeGeometry(2.2, 1.6, 12), M(xf, y + 7.8, zr), { color: "#4a3a30" });
  }
  // Red aircraft beacons, blinking together
  const beaconMat = k.basic({ color: "#ff3b30" });
  const beaconMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 8, 6), beaconMat, Math.max(1, beacons.length));
  beacons.forEach((b, i) => beaconMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(b)));
  beaconMesh.count = beacons.length;
  k.add(beaconMesh);
  k.tick((t) => beaconMat.color.setRGB(Math.sin(t * 3) > 0.2 ? 1 : 0.25, 0.1, 0.08));

  // Streets: dark asphalt with lit traffic moving along them
  const streets = k.tex(
    256,
    256,
    (ctx) => {
      ctx.fillStyle = "#1a1e27";
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "#2a2f3a";
      ctx.fillRect(0, 0, 256, 40);
      ctx.fillRect(0, 0, 40, 256);
    },
    true,
  );
  streets.repeat.set(1600 / BLOCK, 1600 / BLOCK);
  // Shift the tile so its road strip runs down the middle of each gap between blocks
  streets.offset.set(0.675, 0.675);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), k.basic({ map: streets }));
  ground.position.y = STREET;
  k.add(ground);
  const N = 220;
  const cars = Array.from({ length: N }, () => ({
    alongX: k.rnd() < 0.5,
    line: (Math.floor(k.r(-6, 7)) + 0.5) * BLOCK + k.r(-2.5, 2.5),
    dir: k.rnd() < 0.5 ? 1 : -1,
    speed: k.r(10, 18),
    off: k.r(0, 800),
  }));
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  cars.forEach((c, i) => col.set(c.dir > 0 ? [1, 0.95, 0.8] : [1, 0.2, 0.15], i * 3));
  const tg = new THREE.BufferGeometry();
  tg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  tg.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const traffic = new THREE.Points(tg, k.own(new THREE.PointsMaterial({ size: 2.2, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  traffic.frustumCulled = false;
  k.add(traffic);
  const v = new THREE.Vector3();
  k.tick((t) => {
    cars.forEach((c, i) => {
      const s = (((t * c.speed + c.off) % 800) - 400) * c.dir;
      if (c.alongX) v.copy(V(s, STREET + 0.6, c.line));
      else v.copy(V(c.line, STREET + 0.6, s));
      pos.set([v.x, v.y, v.z], i * 3);
    });
    tg.attributes.position.needsUpdate = true;
  });

  // A neon billboard on the building across from the hoop
  const board = k.tex(512, 192, (ctx) => {
    ctx.fillStyle = "#0b0f1d";
    ctx.fillRect(0, 0, 512, 192);
    ctx.shadowColor = "#ff4fd8";
    ctx.shadowBlur = 24;
    ctx.strokeStyle = "#ff4fd8";
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, 484, 164);
    ctx.shadowColor = "#6ef0ff";
    ctx.fillStyle = "#c9fbff";
    ctx.font = `700 84px ${k.o.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("AIRHOOPS", 256, 100);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(30, 11), k.basic({ map: board }));
  sign.position.copy(V(70, 14, 18));
  k.add(sign);
  k.box(metal, 30.5, 11.5, 0.5, 70.4, 8.25, 18, { color: "#1a1f2b" });
  k.rod(metal, 0.3, [70.5, -30, 6], [70.5, 8.3, 6], "#1a1f2b");
  k.rod(metal, 0.3, [70.5, -30, 30], [70.5, 8.3, 30], "#1a1f2b");

  // Moon and stars
  skySprite(k, glowTexture(k, "rgba(244,246,255,1)", "rgba(200,215,255,0)"), 420, 170, 140, 34);
  skySprite(k, glowTexture(k, "rgba(170,195,255,0.35)", "rgba(120,150,255,0)"), 420, 170, 140, 160, true);
  stars(k, 700);

  return k.finish([90, 560]);
}

/* ───────── Neon Grid ───────── */

function neon(k: Kit): Venue {
  const p = k.o.palette;
  const gridMap = k.tex(
    128,
    128,
    (ctx) => {
      ctx.fillStyle = "#0b0418";
      ctx.fillRect(0, 0, 128, 128);
      ctx.shadowColor = "#ff2fd6";
      ctx.shadowBlur = 8;
      ctx.strokeStyle = "#ff3fdc";
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, 128, 128);
    },
    true,
  );
  gridMap.repeat.set(1600 / 6, 1600 / 6);
  surfaces(k, { color: p.floor, xf: [-11.5, 4.5], zr: 9.5 }, k.basic({ map: gridMap }));
  k.tick((t) => (gridMap.offset.y = (t * 0.08) % 1));

  // Neon tubes outlining the court, glowing pylons round it
  const cyan = k.basic({ color: "#6ef0ff" });
  const pink = k.basic({ color: "#ff3fdc" });
  for (const [w, d, xf, zr] of [
    [19.2, 0.12, -11.5, 0],
    [19.2, 0.12, 4.5, 0],
    [0.12, 16, -3.5, -9.6],
    [0.12, 16, -3.5, 9.6],
  ] as const)
    k.box(cyan, w, 0.04, d, xf, 0, zr, { solid: false });
  for (let i = 0; i < 10; i++) {
    // Half a step round, so no pylon stands on the shooting line behind the backboard
    const a = ((i + 0.5) / 10) * Math.PI * 2;
    const [xf, zr] = [-3 + Math.cos(a) * 24, Math.sin(a) * 24];
    k.box(i % 2 ? pink : cyan, 0.3, 9, 0.3, xf, 0, zr, { solid: "pylon" });
    k.box(i % 2 ? cyan : pink, 1.4, 0.12, 1.4, xf, 9, zr, { solid: false });
  }
  // Gateways in front of and behind the court
  for (const [xf, mat] of [
    [19, pink],
    [-26, cyan],
  ] as const) {
    const arch = new THREE.TorusGeometry(15, 0.18, 6, 48, Math.PI);
    k.put(mat, arch, M(xf, 0, 0), { solid: false });
  }

  // A striped synthwave sun, mountains in wireframe, a skyline outlined in neon
  const sunMap = k.tex(256, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#ffe46b");
    g.addColorStop(0.55, "#ff7a59");
    g.addColorStop(1, "#ff2fa8");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(128, 128, 124, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 7; i++) {
      const y = 140 + i * 17;
      ctx.fillRect(0, y, 256, 3 + i * 1.6);
    }
  });
  skySprite(k, sunMap, 560, 60, -40, 230);
  skySprite(k, glowTexture(k, "rgba(255,80,190,0.45)", "rgba(255,60,180,0)"), 560, 60, -40, 520, true);
  const ridge: THREE.Vector3[] = [];
  const RIDGE_R = 420;
  for (let i = 0; i <= 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    ridge.push(new THREE.Vector3(Math.cos(a) * RIDGE_R, i % 2 ? k.r(30, 90) : k.r(5, 25), Math.sin(a) * RIDGE_R));
  }
  const fill: number[] = [];
  for (let i = 0; i < 90; i++) {
    const a = ridge[i];
    const b = ridge[i + 1];
    fill.push(a.x, -2, a.z, b.x, -2, b.z, b.x, b.y, b.z, a.x, -2, a.z, b.x, b.y, b.z, a.x, a.y, a.z);
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute("position", new THREE.Float32BufferAttribute(fill, 3));
  k.add(new THREE.Mesh(mg, k.basic({ color: "#14052a", side: THREE.DoubleSide, fog: false })));
  const edge = new THREE.BufferGeometry().setFromPoints(ridge);
  k.add(new THREE.Line(edge, k.own(new THREE.LineBasicMaterial({ color: "#ff3fdc", fog: false }))));

  const sky = k.basic({ color: "#ffffff" });
  const outline: number[] = [];
  for (let i = 0; i < 40; i++) {
    const zr = -260 + i * 13 + k.r(-3, 3);
    const w = k.r(7, 12);
    const h = k.r(12, 70);
    const xf = 300 + k.r(0, 40);
    k.box(sky, w, h, w, xf, 0, zr, { color: "#0d0420" });
    // Top edges, in cyan
    const y = h;
    outline.push(...V(xf - w / 2, y, zr - w / 2).toArray(), ...V(xf - w / 2, y, zr + w / 2).toArray());
    outline.push(...V(xf - w / 2, y, zr - w / 2).toArray(), ...V(xf - w / 2, 0, zr - w / 2).toArray());
  }
  const og = new THREE.BufferGeometry();
  og.setAttribute("position", new THREE.Float32BufferAttribute(outline, 3));
  k.add(new THREE.LineSegments(og, k.own(new THREE.LineBasicMaterial({ color: "#6ef0ff" }))));

  // Neon palms and floating wireframe shapes
  const palmTrunk = k.basic({ color: "#2a0f45" });
  const palmCrown = k.basic({ color: "#ff3fdc", side: THREE.DoubleSide });
  palms(k, scatter(k, 12, { xf: [-34, 26], zr: [-38, 38] }, [{ xf: [-12, 5], zr: [-10, 10] }], 7, 5.6), palmTrunk, palmCrown, !k.o.calm);
  const shapes = [new THREE.OctahedronGeometry(2.4), new THREE.IcosahedronGeometry(2.2), new THREE.TetrahedronGeometry(2.6), new THREE.TorusGeometry(2, 0.5, 6, 12)];
  const floaters = Array.from({ length: 7 }, (_, i) => {
    const m = new THREE.Mesh(shapes[i % shapes.length], k.basic({ color: i % 2 ? "#6ef0ff" : "#ff3fdc", wireframe: true }));
    const a = k.r(0, Math.PI * 2);
    const r = k.r(28, 46);
    const base = V(-3 + Math.cos(a) * r, k.r(12, 24), Math.sin(a) * r);
    m.position.copy(base);
    k.add(m);
    return { m, base, ph: k.r(0, 6) };
  });
  k.tick((t) => {
    for (const f of floaters) {
      f.m.rotation.set(t * 0.3 + f.ph, t * 0.4, 0);
      f.m.position.y = f.base.y + Math.sin(t * 0.7 + f.ph) * 0.8;
    }
  });
  stars(k, 500, "#ffd6ff");

  return k.finish([80, 620]);
}

const BUILDERS: Record<CourtThemeId, (k: Kit) => Venue> = { arena, park, beach, rooftop, neon };
const SEEDS: Record<CourtThemeId, number> = { arena: 101, park: 202, beach: 303, rooftop: 404, neon: 505 };

/** Builds the surroundings for a court theme, centred on the hoop (place the group at the hoop's floor point). */
export function buildVenue(theme: CourtThemeId, o: VenueOptions): Venue {
  return BUILDERS[theme](new Kit(o, SEEDS[theme]));
}
