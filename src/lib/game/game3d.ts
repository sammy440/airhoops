import * as THREE from "three";
import type { Side } from "@/lib/pose/kinematics";
import type { Avatar } from "./avatar";
import { COURTS_3D, type Court3D } from "./courts3d";
import { COLORS, GameCore, type FloatText, type GameCallbacks, type Vec3 } from "./engine";
import { hoopOffset, type Court } from "./physics";
import { Player3D } from "./player3d";
import { liveBody, restBody, type Body } from "./pose3d";

/**
 * 3D WebGL renderer (three.js): the court from behind the shooter's right shoulder.
 * Game logic lives in GameCore; this only builds and draws the scene.
 *
 * Physics axes (x toward the hoop, y up, z to the shooter's right) map to three.js as
 * (x, y, z)phys → (z, y, −x)three, so the hoop is "into the screen" and right is right.
 *
 * Kept cheap for laptops already running pose tracking: no shadow maps (blob shadows),
 * low-poly meshes, one hemisphere + one directional light, DPR capped at 2.
 */

const toThree = (v: Vec3, out = new THREE.Vector3()) => out.set(v.z, v.y, -v.x);
const UP = new THREE.Vector3(0, 1, 0);

/** Court markings, in metres relative to the hoop centre (FIBA-ish). */
const LINES = { baseline: 1.575, laneWidth: 4.9, freeThrow: 4.6, ftCircle: 1.8, three: 6.75, threeSide: 6.6 };
/** The marked area: lateral half-width, and how far it reaches back from the hoop / past it. */
const AREA = { half: 7.5, back: 9.2, front: 2.6 };
const PPM = 64;

function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d")!);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function radialTexture(stops: [number, string][]) {
  return canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [at, c] of stops) g.addColorStop(at, c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

/** Places a unit-height mesh (cylinder along y) between two points. */
function segment(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  if (len > 1e-6) mesh.quaternion.setFromUnitVectors(UP, dir.divideScalar(len));
  mesh.scale.set(1, Math.max(1e-3, len), 1);
}

export class Game3D extends GameCore {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(48, 1, 0.05, 200);
  private palette: Court3D = COURTS_3D.arena;
  private font = "Impact, sans-serif";

  // Scene parts rebuilt on court / theme change
  private world = new THREE.Group();
  private hoop = new THREE.Group();
  private hemi = new THREE.HemisphereLight();
  private sun = new THREE.DirectionalLight("#ffffff", 1.4);
  private net!: THREE.LineSegments;
  private flag!: THREE.Mesh;

  // Dynamic objects
  private ballMesh: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private glow: THREE.Sprite;
  private halo: THREE.Sprite;
  private chargeRing: THREE.Sprite;
  private chargeDrawn = -1;
  private trailMeshes: THREE.Mesh[] = [];
  private ghostLine: THREE.Line | null = null;
  private ghostOf: unknown = null;
  private sparks: THREE.Points;
  /** Dashed line on the floor from the shooter towards the hoop, swung by the aim. */
  private guide: THREE.Group;
  private guideLen = 0;
  private textSprites = new Map<FloatText, THREE.Sprite>();

  // Player
  private player: Player3D;
  private playerShadow: THREE.Mesh;

  constructor(
    private canvas: HTMLCanvasElement,
    cb: GameCallbacks = {},
    court?: Court,
  ) {
    super(cb, court);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 2, powerPreference: "high-performance" });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const display = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim();
    if (display) this.font = display;

    this.player = new Player3D(this.font);
    this.scene.add(this.world, this.hemi, this.sun, this.player.group);
    this.sun.position.set(-3, 9, 4);

    // Ball, its shadow and glows
    const r = this.court.ballRadius;
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.65 }));
    this.ballShadow = new THREE.Mesh(
      new THREE.CircleGeometry(r * 1.5, 24),
      new THREE.MeshBasicMaterial({ map: radialTexture([[0, "rgba(0,0,0,0.55)"], [1, "rgba(0,0,0,0)"]]), transparent: true, depthWrite: false }),
    );
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture("rgba(255,225,77,0.95)"), transparent: true, depthWrite: false }));
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: radialTexture([[0.35, "rgba(255,120,30,0.6)"], [1, "rgba(255,60,0,0)"]]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.chargeRing = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }));
    this.scene.add(this.ballMesh, this.ballShadow, this.glow, this.halo, this.chargeRing);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(this.ballMesh.geometry, new THREE.MeshBasicMaterial({ color: COLORS.sun, transparent: true, depthWrite: false }));
      m.visible = false;
      this.trailMeshes.push(m);
      this.scene.add(m);
    }

    // Particles: a fixed pool, additive so fading = dimming
    const cap = 256;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
    this.sparks = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.06, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);

    this.playerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 24),
      new THREE.MeshBasicMaterial({ map: radialTexture([[0, "rgba(0,0,0,0.5)"], [1, "rgba(0,0,0,0)"]]), transparent: true, depthWrite: false }),
    );
    this.playerShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.playerShadow);

    // Aim guide: a row of dots along −z (towards the hoop) ending in a chevron; spaced to the court (updateGuide).
    this.guide = new THREE.Group();
    const guideMat = new THREE.MeshBasicMaterial({ color: COLORS.sun, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    const dot = new THREE.CircleGeometry(0.05, 12);
    for (let i = 0; i < GUIDE_DOTS; i++) {
      const d = new THREE.Mesh(dot, guideMat);
      d.rotation.x = -Math.PI / 2;
      this.guide.add(d);
    }
    const tip = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.22, 0), new THREE.Vector2(0, -0.32), new THREE.Vector2(0.22, 0), new THREE.Vector2(0, -0.12)])),
      guideMat,
    );
    tip.rotation.x = -Math.PI / 2;
    this.guide.add(tip);
    this.scene.add(this.guide);

    this.buildScene();
    this.player.setLook(this.look);
  }

  // ── Renderer hooks ──

  resize(cssW: number, cssH: number, dpr = window.devicePixelRatio || 1) {
    this.w = cssW;
    this.h = cssH;
    this.renderer.setPixelRatio(Math.min(2, dpr));
    this.renderer.setSize(cssW, cssH, false);
    this.frameCamera();
  }

  setLeftInset(px: number) {
    super.setLeftInset(px);
    this.frameCamera();
  }

  setAvatar(look: Avatar) {
    super.setAvatar(look);
    this.player.setLook(look);
  }

  protected sceneChanged() {
    this.buildScene();
  }

  protected dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    (this.scene.background as THREE.Texture | null)?.dispose?.();
    this.renderer.dispose();
  }

  protected handsWorld(): Vec3 {
    const { pts } = this.body();
    const l = pts[15];
    const rt = pts[16];
    // Keep the ball near the release point so the launch blend stays short.
    return {
      x: Math.max(-0.4, Math.min(0.2, (l.x + rt.x) / 2 + 0.05)),
      y: Math.max(1.2, Math.min(2.6, (l.y + rt.y) / 2)),
      z: Math.max(-0.6, Math.min(0.6, (l.z + rt.z) / 2)),
    };
  }

  protected wristWorld(hand: Side): Vec3 | null {
    const b = this.body();
    return b.live ? b.pts[hand === "left" ? 15 : 16] : null;
  }

  // ── Camera ──

  /** Behind the shooter's right shoulder, looking up the floor at the hoop; the court fits beside the left inset. */
  private frameCamera() {
    if (!this.w || !this.h) return;
    const portrait = this.h > this.w;
    const d = this.court.hoopDistance;
    this.camera.fov = portrait ? 62 : 40;
    this.camera.aspect = this.w / this.h;
    // Far enough back to see the player's back and shoulders (the turn you aim with), hoop in the upper third.
    toThree({ x: portrait ? -5.2 : -4.5, y: 2.75, z: 0.9 }, this.camera.position);
    this.camera.lookAt(toThree({ x: d * 0.55, y: 2.05, z: 0.1 }));
    if (this.leftInset) this.camera.setViewOffset(this.w, this.h, -this.leftInset / 2, 0, this.w, this.h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  // ── Scene ──

  private buildScene() {
    const p = (this.palette = COURTS_3D[this.theme.id]);
    const c = this.court;
    for (const child of [...this.world.children]) {
      this.world.remove(child);
      child.traverse((o) => {
        (o as THREE.Mesh).geometry?.dispose();
      });
    }
    this.hoop = new THREE.Group();
    this.world.add(this.hoop);

    (this.scene.background as THREE.Texture | null)?.dispose?.();
    this.scene.background = canvasTexture(4, 256, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, p.sky[0]);
      g.addColorStop(1, p.sky[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 4, 256);
    });
    this.scene.fog = new THREE.Fog(p.fog, 16, 60);
    this.hemi.color.set(p.light[0]);
    this.hemi.groundColor.set(p.light[1]);
    this.hemi.intensity = p.lightIntensity;

    // Floor and markings
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: p.floor, roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2;
    this.world.add(floor);
    const depth = AREA.back + AREA.front;
    const marks = new THREE.Mesh(
      new THREE.PlaneGeometry(AREA.half * 2, depth),
      new THREE.MeshStandardMaterial({ map: this.courtMarkings(p), transparent: true, depthWrite: false, roughness: 0.8 }),
    );
    marks.rotation.x = -Math.PI / 2;
    toThree({ x: c.hoopDistance + (AREA.front - AREA.back) / 2, y: 0.003, z: 0 }, marks.position);
    this.world.add(marks);

    // Backboard: glass, white frame, red target square
    const boardX = c.hoopDistance + c.rimRadius + c.boardGap;
    const boardH = c.boardTop - c.boardBottom;
    const boardW = c.boardHalfWidth * 2;
    const boardMid = { x: boardX + 0.02, y: c.rimHeight + (c.boardBottom + c.boardTop) / 2, z: 0 };
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(boardW, boardH, 0.04),
      new THREE.MeshStandardMaterial({ color: p.glass, transparent: true, opacity: p.glassOpacity, roughness: 0.1, depthWrite: false }),
    );
    toThree(boardMid, glass.position);
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry), new THREE.LineBasicMaterial({ color: "#ffffff" }));
    frame.position.copy(glass.position);
    const sq = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        [
          [-0.295, 0.15],
          [-0.295, 0.6],
          [0.295, 0.6],
          [0.295, 0.15],
        ].map(([z, dy]) => toThree({ x: boardX - 0.001, y: c.rimHeight + dy, z })),
      ),
      new THREE.LineBasicMaterial({ color: COLORS.hoop }),
    );
    this.hoop.add(glass, frame, sq);

    // Rim and its bracket
    const rimMat = new THREE.MeshStandardMaterial({ color: COLORS.hoop, metalness: 0.4, roughness: 0.4 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(c.rimRadius + 0.008, 0.012, 10, 48), rimMat);
    rim.rotation.x = Math.PI / 2;
    toThree({ x: c.hoopDistance, y: c.rimHeight, z: 0 }, rim.position);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, c.boardGap + 0.02), rimMat);
    toThree({ x: c.hoopDistance + c.rimRadius + c.boardGap / 2, y: c.rimHeight - 0.02, z: 0 }, bracket.position);
    this.hoop.add(rim, bracket);

    // Net: positions rewritten every frame (sway)
    this.net = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: p.net, transparent: true, opacity: 0.85 }));
    this.net.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(NET_STRANDS * 5 * 2 * 3), 3));
    this.net.frustumCulled = false;
    this.hoop.add(this.net);

    // Stand: pole behind the board, arm, padded base, wind flag on top
    const poleMat = new THREE.MeshStandardMaterial({ color: p.pole, roughness: 0.6, metalness: 0.3 });
    // Stanchion behind the baseline, a long arm reaching to the board.
    const poleX = c.hoopDistance + LINES.baseline + 0.9;
    // Pole stops below the board's top edge, so it doesn't stick up behind the glass.
    const topY = c.rimHeight + 0.15;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1, 16), poleMat);
    segment(pole, toThree({ x: poleX, y: 0, z: 0 }), toThree({ x: poleX, y: topY + 0.1, z: 0 }));
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 10), poleMat);
    segment(arm, toThree({ x: poleX, y: topY, z: 0 }), toThree({ x: boardX + 0.06, y: c.rimHeight + 0.3, z: 0 }));
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), new THREE.MeshStandardMaterial({ color: COLORS.hoop, roughness: 0.7 }));
    toThree({ x: poleX, y: 0.55, z: 0 }, pad.position);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(1, -0.25);
    shape.lineTo(0, -0.5);
    shape.closePath();
    this.flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: COLORS.sun, side: THREE.DoubleSide }));
    // Wind flag on a short mast on the board's top corner (on the right, away from the shooter's eye line).
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), poleMat);
    const flagTop = { x: boardX + 0.02, y: c.rimHeight + c.boardTop + 0.42, z: c.boardHalfWidth - 0.04 };
    segment(mast, toThree({ ...flagTop, y: c.rimHeight + c.boardTop }), toThree(flagTop));
    toThree(flagTop, this.flag.position);
    this.hoop.add(mast);
    this.hoop.add(pole, arm, pad, this.flag);

    this.ghostOf = null; // rebuild the ghost path for the new court
    this.frameCamera();
  }

  /** Lines and paint on a transparent texture laid over the floor. */
  private courtMarkings(p: Court3D) {
    const c = this.court;
    const xMax = c.hoopDistance + AREA.front;
    const W = AREA.half * 2 * PPM;
    const H = (AREA.back + AREA.front) * PPM;
    // Physics (x toward hoop, z right) → canvas (z → right, x → up the image).
    const cx = (z: number) => (z + AREA.half) * PPM;
    const cy = (x: number) => (xMax - x) * PPM;
    const hx = c.hoopDistance;
    return canvasTexture(W, H, (ctx) => {
      ctx.lineWidth = 0.05 * PPM;
      ctx.strokeStyle = p.lines;
      // The lane, painted
      const laneTop = cy(hx + LINES.baseline);
      const laneBottom = cy(hx - LINES.freeThrow);
      ctx.fillStyle = p.paint;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(cx(-LINES.laneWidth / 2), laneTop, LINES.laneWidth * PPM, laneBottom - laneTop);
      ctx.globalAlpha = 1;
      ctx.strokeRect(cx(-LINES.laneWidth / 2), laneTop, LINES.laneWidth * PPM, laneBottom - laneTop);
      // Free-throw circle
      ctx.beginPath();
      ctx.arc(cx(0), cy(hx - LINES.freeThrow), LINES.ftCircle * PPM, 0, Math.PI * 2);
      ctx.stroke();
      // Baseline
      ctx.beginPath();
      ctx.moveTo(0, laneTop);
      ctx.lineTo(W, laneTop);
      ctx.stroke();
      // Three-point line: straight sides from the baseline, then the arc
      const side = LINES.threeSide;
      const join = Math.sqrt(LINES.three ** 2 - side ** 2);
      ctx.beginPath();
      ctx.moveTo(cx(-side), laneTop);
      ctx.lineTo(cx(-side), cy(hx - join));
      const a0 = Math.atan2(-join, -side);
      ctx.arc(cx(0), cy(hx), LINES.three * PPM, Math.PI - Math.abs(a0), Math.abs(a0), true);
      ctx.lineTo(cx(side), laneTop);
      ctx.stroke();
      // Release spot
      ctx.fillStyle = p.lines;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(cx(0), cy(0), 0.12 * PPM, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ── Player ──

  /** The live pose as a skeleton, or the animated stance without one. */
  private body(): Body {
    return liveBody(this.pose) ?? restBody(this.sinceLaunch, this.charge);
  }

  // ── Frame ──

  protected render() {
    if (!this.w) return;
    const c = this.court;
    const hoopZ = hoopOffset(c, this.hoopPhase);
    this.hoop.position.x = hoopZ; // physics z → three x

    this.updateNet();
    this.updateFlag();
    this.updateGuide();
    this.player.update(this.body());
    this.playerShadow.position.copy(this.player.footprint).setY(0.004);
    this.updateBall();
    this.updateGhost();
    this.updateSparks();
    this.updateTexts();
    this.renderer.render(this.scene, this.camera);
  }

  private updateBall() {
    const r = this.court.ballRadius;
    const pos = toThree(this.ball);
    this.ballMesh.position.copy(pos);
    this.ballMesh.rotation.set(this.ball.rot, 0, 0); // backspin about the sideways axis
    let alpha = 1;
    if (this.phase === "result" && this.sim?.result.scored === false && this.now - this.respawnAt > -200) {
      alpha = Math.max(0, (this.respawnAt - this.now) / 200);
    }
    const mat = this.ballMesh.material as THREE.MeshStandardMaterial;
    mat.transparent = alpha < 1;
    mat.opacity = alpha;

    const height = Math.max(0, this.ball.y);
    const k = Math.max(0.15, 1 - height / 5);
    this.ballShadow.position.set(pos.x, 0.005, pos.z);
    this.ballShadow.scale.setScalar(1.4 - k * 0.4);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = k * alpha;

    const ready = this.phase === "ready";
    this.glow.visible = this.loaded && ready;
    if (this.glow.visible) {
      this.glow.position.copy(pos);
      this.glow.scale.setScalar(r * 3.4 * (1 + Math.sin(this.now / 140) * 0.08));
    }
    this.halo.visible = this.hot && ready;
    if (this.halo.visible) {
      this.halo.position.copy(pos);
      this.halo.scale.setScalar(r * 5 * (1 + Math.sin(this.now / 60) * 0.06 + Math.sin(this.now / 23) * 0.04));
    }
    this.chargeRing.visible = this.charge !== null && ready;
    if (this.chargeRing.visible) {
      const q = Math.round((this.charge ?? 0) * 50) / 50;
      if (q !== this.chargeDrawn) {
        this.chargeDrawn = q;
        (this.chargeRing.material as THREE.SpriteMaterial).map?.dispose();
        (this.chargeRing.material as THREE.SpriteMaterial).map = chargeTexture(q);
        (this.chargeRing.material as THREE.SpriteMaterial).needsUpdate = true;
      }
      this.chargeRing.position.copy(pos);
      this.chargeRing.scale.setScalar(r * 5);
    }

    this.trailMeshes.forEach((m, i) => {
      const p = this.trail[i];
      m.visible = !!p && this.phase === "flying";
      if (!p) return;
      toThree(p, m.position);
      const f = i / this.trail.length;
      m.scale.setScalar(0.25 + f * 0.5);
      (m.material as THREE.MeshBasicMaterial).opacity = f * 0.18;
    });
  }

  private updateNet() {
    const c = this.court;
    const since = (this.now - this.netKickAt) / 1000;
    const kick = this.netKick * Math.exp(-since * 3.2);
    const sway = Math.sin(since * 16) * kick;
    const depth = 0.42 * (1 + kick * 0.35);
    const ring = (radius: number, dy: number, s: number) =>
      Array.from({ length: NET_STRANDS }, (_, i) => {
        const a = (i / NET_STRANDS) * Math.PI * 2;
        return toThree({ x: c.hoopDistance + Math.cos(a) * radius + s * 0.04, y: c.rimHeight - dy, z: Math.sin(a) * radius + s * 0.06 });
      });
    const top = ring(c.rimRadius, 0, 0);
    const mid = ring(c.rimRadius * 0.8, depth * 0.5, sway);
    const bot = ring(c.rimRadius * 0.58, depth, sway * 1.6);
    const arr = (this.net.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
    let o = 0;
    const push = (a: THREE.Vector3, b: THREE.Vector3) => {
      arr[o++] = a.x;
      arr[o++] = a.y;
      arr[o++] = a.z;
      arr[o++] = b.x;
      arr[o++] = b.y;
      arr[o++] = b.z;
    };
    for (let i = 0; i < NET_STRANDS; i++) {
      const next = (i + 1) % NET_STRANDS;
      const prev = (i + NET_STRANDS - 1) % NET_STRANDS;
      push(top[i], mid[next]);
      push(top[i], mid[prev]);
      push(mid[i], bot[next]);
      push(mid[i], bot[prev]);
      push(bot[i], bot[next]);
    }
    // The net hangs from the hoop group, which already carries the sideways offset.
    this.net.geometry.getAttribute("position").needsUpdate = true;
  }

  /** Aim guide: from the release spot towards the hoop, turned by the aim; only while the ball is in hand. */
  private updateGuide() {
    this.guide.visible = this.aim !== null && this.phase === "ready" && !this.paused;
    if (!this.guide.visible) return;
    // From just past the player (so their body doesn't hide it) to under the rim
    const start = 0.7;
    const len = Math.max(1, this.court.hoopDistance - 0.25 - start);
    toThree({ x: start, y: 0.012, z: 0 }, this.guide.position);
    this.guide.rotation.y = (-(this.aim ?? 0) * Math.PI) / 180; // rotating −z towards +x (right) is a negative turn
    if (len !== this.guideLen) {
      this.guideLen = len;
      const parts = this.guide.children;
      for (let i = 0; i < GUIDE_DOTS; i++) parts[i].position.set(0, 0, (-len * i) / GUIDE_DOTS);
      parts[GUIDE_DOTS].position.set(0, 0, -len);
    }
  }

  /** Wind flag: points downwind (sideways), longer when stronger. */
  private updateFlag() {
    const strength = Math.min(1, Math.abs(this.wind) / 1.2);
    const dir = this.wind === 0 ? 0 : Math.sign(this.wind);
    const flap = Math.sin(this.now / (90 - strength * 40)) * 0.25 * (0.3 + strength);
    const len = 0.15 + strength * 0.35;
    this.flag.scale.set(dir ? dir * len : 0.08, dir ? 0.3 : 0.5, 1);
    this.flag.rotation.set(0, flap, dir ? 0 : -Math.PI / 2.6);
    (this.flag.material as THREE.MeshStandardMaterial).color.set(this.wind === 0 ? "#8a8578" : COLORS.sun);
  }

  /** Dashed line along the last shot, so a miss shows how far off it was. */
  private updateGhost() {
    const show = !!this.ghost && this.phase !== "flying";
    if (this.ghostOf !== this.ghost) {
      this.ghostOf = this.ghost;
      if (this.ghostLine) {
        this.scene.remove(this.ghostLine);
        this.ghostLine.geometry.dispose();
        (this.ghostLine.material as THREE.Material).dispose();
        this.ghostLine = null;
      }
      if (this.ghost) {
        const pts = this.ghost.map(([, x, y, z]) => toThree({ x, y, z: z ?? 0 }));
        this.ghostLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineDashedMaterial({ color: this.palette.ghost, dashSize: 0.06, gapSize: 0.08, transparent: true, opacity: 0.4 }),
        );
        this.ghostLine.computeLineDistances();
        this.scene.add(this.ghostLine);
      }
    }
    if (this.ghostLine) this.ghostLine.visible = show;
  }

  private updateSparks() {
    const geo = this.sparks.geometry;
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const col = geo.getAttribute("color") as THREE.BufferAttribute;
    const n = Math.min(this.particles.length, pos.count);
    const tmp = new THREE.Color();
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const p = this.particles[i];
      toThree(p, v);
      pos.setXYZ(i, v.x, v.y, v.z);
      tmp.set(p.color).multiplyScalar(Math.max(0, p.life / p.max));
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    geo.setDrawRange(0, n);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  /** Floating "SWISH!" / "+6 ×2" / "SHORT": one sprite per text, rising and fading. */
  private updateTexts() {
    for (const [t, sprite] of this.textSprites) {
      if (!this.texts.includes(t)) {
        this.scene.remove(sprite);
        sprite.material.map?.dispose();
        sprite.material.dispose();
        this.textSprites.delete(t);
      }
    }
    for (const t of this.texts) {
      let sprite = this.textSprites.get(t);
      if (!sprite) {
        sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(t, this.font), transparent: true, depthTest: false, depthWrite: false }));
        sprite.renderOrder = 10;
        this.textSprites.set(t, sprite);
        this.scene.add(sprite);
      }
      const age = (this.now - t.born) / 1000;
      sprite.material.opacity = age < 0.15 ? age / 0.15 : Math.max(0, 1 - (age - 0.9) / 0.7);
      const pop = age < 0.15 ? 0.6 + (age / 0.15) * 0.5 : 1.1 - Math.min(0.1, (age - 0.15) * 0.2);
      // Rising slowly.
      toThree({ x: t.x, y: t.y + age * 0.35, z: t.z }, sprite.position);
      sprite.scale.set(1.8 * pop, 0.9 * pop, 1);
    }
  }
}

const NET_STRANDS = 12;
const GUIDE_DOTS = 12;

function ballTexture() {
  return canvasTexture(512, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#f39a52");
    g.addColorStop(0.5, COLORS.ball);
    g.addColorStop(1, "#c4561c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = "rgba(30,12,4,0.85)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 128);
    ctx.lineTo(512, 128);
    for (const x of [128, 384]) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
    }
    // The two curved seams
    for (const x0 of [0, 256]) {
      ctx.moveTo(x0 + 40, 0);
      ctx.bezierCurveTo(x0 + 110, 80, x0 + 110, 176, x0 + 40, 256);
      ctx.moveTo(x0 + 216, 0);
      ctx.bezierCurveTo(x0 + 146, 80, x0 + 146, 176, x0 + 216, 256);
    }
    ctx.stroke();
  });
}

function ringTexture(color: string) {
  return canvasTexture(128, 128, (ctx) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(64, 64, 56, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function chargeTexture(charge: number) {
  return canvasTexture(128, 128, (ctx) => {
    ctx.lineWidth = 9;
    ctx.strokeStyle = "rgba(247,241,214,0.2)";
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = COLORS.sun;
    ctx.beginPath();
    ctx.arc(64, 64, 52, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
    ctx.stroke();
  });
}

function textTexture(t: FloatText, font: string) {
  return canvasTexture(512, 256, (ctx) => {
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = t.color;
    ctx.font = `120px ${font}`;
    ctx.fillText(t.text, 256, 130);
    if (t.sub) {
      ctx.fillStyle = COLORS.cream;
      ctx.font = `72px ${font}`;
      ctx.fillText(t.sub, 256, 215);
    }
  });
}
