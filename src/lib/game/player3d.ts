import * as THREE from "three";
import type { Avatar } from "./avatar";
import type { Vec3 } from "./engine";
import type { Body, Joint, Skeleton } from "./pose3d";

/**
 * The shooter as a low-poly 3D figure in the player's look (avatar.ts), posed from a
 * Body (pose3d.ts) every frame. Seen mostly from behind, so the back of the jersey
 * carries the number and the back of the head the hair.
 *
 * Limbs are cylinders capped with spheres of the same radius (reads as capsules, and
 * stretching a cylinder doesn't distort the caps). Joints are eased towards each new
 * pose, so tracking jitter and switches between the live pose and the animated
 * stance both look smooth.
 */

const UP = new THREE.Vector3(0, 1, 0);
const toThree = (p: Vec3, out = new THREE.Vector3()) => out.set(p.z, p.y, -p.x);

/** Per-frame easing towards the target pose: snappy for the camera, softer for the stance. */
const EASE = { live: 0.55, rest: 0.3 };

interface Limb {
  mesh: THREE.Mesh;
  caps: THREE.Mesh[];
  from: Joint;
  to: Joint;
  /** How far along from → to it reaches (shorts cover the top of the thigh). */
  reach: number;
}

function place(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  if (len > 1e-6) mesh.quaternion.setFromUnitVectors(UP, dir.divideScalar(len));
  mesh.scale.set(1, Math.max(1e-3, len), 1);
}

function shade(hex: string, k: number) {
  return new THREE.Color(hex).multiplyScalar(k);
}

export class Player3D {
  readonly group = new THREE.Group();
  private key = "";
  private limbs: Limb[] = [];
  private hands: THREE.Mesh[] = [];
  private torso!: THREE.Mesh;
  private pelvis!: THREE.Mesh;
  private neck!: THREE.Mesh;
  private head!: THREE.Group;
  private shoes: THREE.Group[] = [];
  private shown: Skeleton | null = null;
  private female = false;

  constructor(private font: string) {}

  setLook(look: Avatar) {
    const key = JSON.stringify(look);
    if (key === this.key) return;
    this.key = key;
    this.dispose();
    this.build(look);
  }

  dispose() {
    // Geometries and materials are shared between meshes: free each once.
    const freed = new Set<{ dispose(): void }>();
    const free = (r: { dispose(): void } | undefined) => {
      if (r && !freed.has(r)) {
        freed.add(r);
        r.dispose();
      }
    };
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      free(m.geometry);
      const mat = m.material as THREE.MeshStandardMaterial | undefined;
      free(mat?.map ?? undefined);
      free(mat);
    });
    this.group.clear();
    this.limbs = [];
    this.hands = [];
    this.shoes = [];
  }

  private build(look: Avatar) {
    const f = (this.female = look.gender === "female");
    const mat = (color: THREE.ColorRepresentation, roughness = 0.75) => new THREE.MeshStandardMaterial({ color, roughness });
    const skin = mat(look.skin, 0.65);
    const jersey = mat(look.jersey, 0.8);
    const trim = mat(shade(look.jersey, 0.6), 0.8);
    const shorts = mat(look.shorts, 0.8);
    const shoes = mat(look.shoes, 0.55);
    const white = mat("#f4f1ea", 0.7);
    const sphere = new THREE.SphereGeometry(1, 14, 10);

    const limb = (radius: number, m: THREE.Material, from: Joint, to: Joint, capFrom = true, reach = 1) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.92, 1, 12, 1, true), m);
      const caps = [capFrom ? from : null, to].filter((j) => j !== null).map(() => {
        const c = new THREE.Mesh(sphere, m);
        c.scale.setScalar(radius);
        return c;
      });
      this.limbs.push({ mesh, caps, from, to, reach });
      this.group.add(mesh, ...caps);
    };

    // Arms: bare (sleeveless jersey). Upper arm, then forearm.
    for (const [s, e, w] of [
      [11, 13, 15],
      [12, 14, 16],
    ] as const) {
      limb(f ? 0.043 : 0.05, skin, s, e);
      limb(f ? 0.036 : 0.041, skin, e, w, false);
    }
    // Hands: flattened ellipsoids pointing from wrist to fingers
    for (let i = 0; i < 2; i++) {
      const h = new THREE.Mesh(sphere, skin);
      h.scale.set(f ? 0.04 : 0.045, f ? 0.075 : 0.085, 0.028);
      this.hands.push(h);
      this.group.add(h);
    }
    // Legs: thigh and shin; shorts over the thighs
    for (const [hip, knee, ankle] of [
      [23, 25, 27],
      [24, 26, 28],
    ] as const) {
      limb(f ? 0.06 : 0.066, skin, hip, knee, false);
      limb(f ? 0.045 : 0.05, skin, knee, ankle, false);
      limb(f ? 0.1 : 0.105, shorts, hip, knee, false, 0.42);
    }

    // Torso: a lathe (waist → chest → shoulders), flattened front to back, with the number on the back.
    const profile = (f
      ? [[0.15, 0], [0.145, 0.25], [0.13, 0.45], [0.15, 0.68], [0.165, 0.86], [0.15, 0.96], [0.07, 1]]
      : [[0.155, 0], [0.155, 0.25], [0.15, 0.45], [0.17, 0.7], [0.19, 0.88], [0.17, 0.97], [0.08, 1]]
    ).map(([r, y]) => new THREE.Vector2(r, y - 0.5));
    this.torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 20), jersey);
    const neckTrim = new THREE.Mesh(new THREE.TorusGeometry(f ? 0.07 : 0.08, 0.012, 6, 20), trim);
    neckTrim.rotation.x = Math.PI / 2;
    neckTrim.position.y = 0.49;
    const hem = new THREE.Mesh(new THREE.TorusGeometry(f ? 0.15 : 0.155, 0.01, 6, 24), trim);
    hem.rotation.x = Math.PI / 2;
    hem.position.y = -0.49;
    const number = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.26),
      new THREE.MeshBasicMaterial({ map: numberTexture(look.number, this.font), transparent: true, depthWrite: false }),
    );
    number.position.set(0, 0.12, (f ? 0.16 : 0.18) + 0.004); // the back: three's +z faces the camera
    this.torso.add(neckTrim, hem, number);
    this.pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 1, 16), shorts);
    this.neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 1, 10), skin);
    this.group.add(this.torso, this.pelvis, this.neck);

    // Head: skull, ears, hair
    this.head = new THREE.Group();
    const skull = new THREE.Mesh(sphere, skin);
    skull.scale.set(0.1, 0.118, 0.108);
    this.head.add(skull);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(sphere, skin);
      ear.scale.set(0.014, 0.026, 0.02);
      ear.position.set(side * 0.1, 0, 0.005);
      this.head.add(ear);
    }
    this.head.add(hair(look));
    this.group.add(this.head);

    // Shoes: upper + white sole, toe towards the hoop (three −z)
    for (let i = 0; i < 2; i++) {
      const shoe = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.26), shoes);
      upper.position.set(0, 0.0, -0.05);
      const toe = new THREE.Mesh(sphere, shoes);
      toe.scale.set(0.05, 0.035, 0.05);
      toe.position.set(0, -0.005, -0.18);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.02, 0.29), white);
      sole.position.set(0, -0.045, -0.06);
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10), white);
      sock.position.set(0, 0.06, 0);
      shoe.add(upper, toe, sole, sock);
      this.shoes.push(shoe);
      this.group.add(shoe);
    }
  }

  /** Eases towards `body` and poses every mesh. */
  update(body: Body) {
    const ease = body.live ? EASE.live : EASE.rest;
    if (!this.shown) this.shown = structuredClone(body.pts);
    for (const k of Object.keys(body.pts) as unknown as Joint[]) {
      const t = body.pts[k];
      const s = this.shown[k];
      s.x += (t.x - s.x) * ease;
      s.y += (t.y - s.y) * ease;
      s.z += (t.z - s.z) * ease;
    }
    const P = (j: Joint) => toThree(this.shown![j]);

    for (const l of this.limbs) {
      const a = P(l.from);
      const b = P(l.to).sub(a).multiplyScalar(l.reach).add(a);
      place(l.mesh, a, b);
      // Caps: [from, to] or just [to]
      if (l.caps.length === 2) l.caps[0].position.copy(a);
      l.caps.at(-1)?.position.copy(b);
    }

    // Hands: from the wrist towards the fingers (index landmark)
    for (const [i, w, n] of [
      [0, 15, 19],
      [1, 16, 20],
    ] as const) {
      const wrist = P(w);
      const dir = P(n).sub(wrist);
      if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
      dir.normalize();
      const h = this.hands[i];
      h.position.copy(wrist).addScaledVector(dir, 0.06);
      h.quaternion.setFromUnitVectors(UP, dir);
    }

    // Torso from hip midpoint to shoulder midpoint
    const hips = P(23).add(P(24)).multiplyScalar(0.5);
    const shoulders = P(11).add(P(12)).multiplyScalar(0.5);
    const top = shoulders.clone().add(new THREE.Vector3(0, 0.05, 0));
    place(this.torso, hips, top);
    const span = P(11).distanceTo(P(12));
    const width = Math.max(0.9, Math.min(1.3, span / (this.female ? 0.32 : 0.36)));
    this.torso.scale.set(width, this.torso.scale.y, 0.62);

    // Pelvis (shorts' waistband) around the hips
    place(this.pelvis, hips.clone().add(new THREE.Vector3(0, -0.1, 0)), hips.clone().add(new THREE.Vector3(0, 0.06, 0)));
    this.pelvis.scale.set(1, this.pelvis.scale.y, 0.68);

    // Neck and head above the shoulders, leaning towards the nose.
    const neckTop = top.clone().add(new THREE.Vector3(0, 0.09, 0));
    place(this.neck, top.clone().add(new THREE.Vector3(0, -0.03, 0)), neckTop);
    const nose = P(0);
    const lean = Math.max(-0.06, Math.min(0.06, nose.x - shoulders.x));
    this.head.position.set(neckTop.x + lean, neckTop.y + 0.11, neckTop.z);
    this.head.rotation.set(0, 0, -lean * 2);

    // Feet flat on (or above, in a hop) the floor under the ankles
    for (const [i, a] of [
      [0, 27],
      [1, 28],
    ] as const) {
      const ankle = P(a);
      this.shoes[i].position.set(ankle.x, Math.max(0.055, ankle.y - 0.02), ankle.z);
    }
  }

  /** Where to drop the player's blob shadow (under the hips). */
  get footprint() {
    return this.shown ? toThree({ x: (this.shown[23].x + this.shown[24].x) / 2, y: 0, z: (this.shown[23].z + this.shown[24].z) / 2 }) : new THREE.Vector3();
  }
}

/** The six hair styles from avatar.ts, sitting on a unit head (skull ≈ 0.1 × 0.118 × 0.108). */
function hair(look: Avatar): THREE.Object3D {
  const g = new THREE.Group();
  if (look.hair === "bald") return g;
  const m = new THREE.MeshStandardMaterial({ color: look.hairColor, roughness: 0.95 });
  if (look.hair === "afro") {
    const afro = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), m);
    afro.scale.set(0.155, 0.15, 0.155);
    afro.position.set(0, 0.06, 0.02);
    g.add(afro);
    return g;
  }
  // Cap over the top and back of the skull (the side the camera sees)
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), m);
  cap.scale.set(0.106, 0.125, 0.115);
  cap.position.set(0, 0.008, 0.006);
  cap.rotation.x = -0.35;
  g.add(cap);
  if (look.hair === "braids") {
    for (let i = 0; i < 7; i++) {
      const a = -0.9 + (i / 6) * 1.8;
      const braid = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.009, 0.24, 6), m);
      braid.position.set(Math.sin(a) * 0.085, -0.1, Math.cos(a) * 0.07 + 0.03);
      braid.rotation.x = 0.2;
      g.add(braid);
    }
  } else if (look.hair === "ponytail") {
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.016, 0.26, 8), m);
    tail.position.set(0, -0.06, 0.13);
    tail.rotation.x = 0.4;
    g.add(tail);
  } else if (look.hair === "bun") {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), m);
    bun.position.set(0, 0.1, 0.07);
    g.add(bun);
  }
  return g;
}

function numberTexture(n: number, font: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.font = `100px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
