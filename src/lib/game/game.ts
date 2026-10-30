import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { Side } from "@/lib/pose/kinematics";
import { DEFAULT_COURT, hoopOffset, simulateShot, type Court, type Launch, type ShotEvent, type ShotSim } from "./physics";
import { DEFAULT_AVATAR, type Avatar } from "./avatar";
import { COURT_THEMES, DEFAULT_COURT_THEME, drawScenery, type CourtTheme, type CourtThemeId } from "./courts";
import { DEFAULT_POSE, drawPlayer, type Vec } from "./drawPlayer";
import { sfx } from "./sfx";

/**
 * Canvas game scene: playback of a deterministic shot simulation plus all
 * the juice (trail, net ripple, particles, floating text, sound).
 *
 * World units are meters (y up). Physics never runs per-frame here: each
 * throw is simulated once (simulateShot) and played back by wall-clock time,
 * the same way multiplayer plays server-authoritative paths.
 */

export type GamePhase = "ready" | "flying" | "result";

export interface GameCallbacks {
  onLaunch?: (sim: ShotSim) => void;
  /**
   * Fires at the moment of scoring, or when a miss settles. May return the
   * points label to float above the rim (e.g. "+6 ×2"), so streak and
   * difficulty multipliers show where the player is looking.
   */
  onResult?: (sim: ShotSim) => string | void;
  onReady?: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

interface FloatText {
  text: string;
  sub?: string;
  x: number;
  y: number;
  born: number;
  color: string;
}

const C = {
  hoop: "#ea3a1d",
  ball: "#f07b2c",
  cream: "#f7f1d6",
  sun: "#f6a13a",
  ink: "#0e0e0d",
};
const RESPAWN_MS = 650;
const HAND_BLEND_S = 0.12;
/** A dribble lasts one beat of the player's rhythm, within these limits. */
const DRIBBLE_MS = { min: 280, max: 800, fallback: 450 };
/** Fraction of the beat spent going down (pushed), the rest coming back up. */
const DRIBBLE_DOWN = 0.42;

export class Game {
  court: Court;
  phase: GamePhase = "ready";
  /** Paused games freeze the clock: flight, hoop motion and timers all stop. */
  paused = false;

  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  /** Game clock (ms). Advances only while unpaused, so pausing freezes everything. */
  private now = 0;
  private lastTs = 0;
  /** Wind (m/s²) applied to the next shot and shown by the flag. */
  private wind = 0;
  /** Static scenery + floor, re-rendered only on resize / court / theme change. */
  private bg: HTMLCanvasElement | null = null;

  private sim: ShotSim | null = null;
  private launchedAt = 0;
  private eventIdx = 0;
  private resultSent = false;
  private respawnAt = 0;
  private handOffset = { x: 0, y: 0 };

  private ball = { x: 0, y: 0, rot: 0 };
  private trail: { x: number; y: number }[] = [];
  private ghost: [number, number, number][] | null = null;
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private netKick = 0;
  private netKickAt = -1e9;
  private theme: CourtTheme = COURT_THEMES[DEFAULT_COURT_THEME];
  private font = "Impact, sans-serif";

  private pose: NormalizedLandmark[] | undefined;
  /** Screen pixels on the left covered by UI (camera preview); the court fits beside it. */
  private leftInset = 0;
  private charge: number | null = null;
  /** Ball bouncing from one hand to the floor and back (see bounce()). */
  private dribble: { hand: Side; start: number; period: number; strength: number; hit: boolean } | null = null;
  /** Body, skin, hair and kit (see avatar.ts). */
  private look: Avatar = DEFAULT_AVATAR;
  private loaded = false;
  private hot = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private cb: GameCallbacks = {},
    court: Court = DEFAULT_COURT,
  ) {
    this.court = court;
    this.ctx = canvas.getContext("2d")!;
    this.ball = { x: 0, y: court.releaseHeight, rot: 0 };
    const display = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim();
    if (display) this.font = display;
  }

  // ── Public API ──

  resize(cssW: number, cssH: number, dpr = window.devicePixelRatio || 1) {
    this.w = cssW;
    this.h = cssH;
    // Cap DPR: 3× phones would triple fill cost for no visible gain.
    this.dpr = Math.min(2, dpr);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.bg = null;
  }

  start() {
    const loop = (ts: number) => {
      const dt = this.lastTs ? Math.min(100, ts - this.lastTs) : 16;
      this.lastTs = ts;
      if (!this.paused) this.now += dt;
      if (!document.hidden) {
        this.update();
        this.draw();
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  setPaused(p: boolean) {
    this.paused = p;
  }

  /** Switch difficulty: new distance / rim / motion. Clears the old ghost path. */
  setCourt(court: Court) {
    this.court = court;
    this.ghost = null;
    this.bg = null;
  }

  /** Cosmetic court scenery (see courts.ts). */
  setTheme(id: CourtThemeId) {
    if (this.theme.id === id) return;
    this.theme = COURT_THEMES[id];
    this.bg = null;
  }

  setWind(w: number) {
    this.wind = w;
  }

  /** Game clock in seconds (the phase a moving hoop is at). */
  get clock() {
    return this.now / 1000;
  }

  /**
   * Hoop-motion phase (s). Multiplayer points this at the server's match
   * clock so a moving hoop is in the same place for everyone.
   */
  private phaseSource: (() => number | null) | null = null;

  setPhaseSource(fn: (() => number | null) | null) {
    this.phaseSource = fn;
  }

  get hoopPhase() {
    return this.phaseSource?.() ?? this.clock;
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  canThrow() {
    return this.phase === "ready" && !this.paused;
  }

  /** A shot is in the air (its result hasn't been reported yet). */
  get ballInFlight() {
    return this.phase === "flying" && !this.resultSent;
  }

  /** Simulates and launches a shot. Returns the simulation, or null if a ball is in flight. */
  throwBall(launch: Launch): ShotSim | null {
    if (!this.canThrow()) return null;
    const sim = simulateShot(launch, this.court, { wind: this.wind, phase: this.hoopPhase });
    const hands = this.handsWorld();
    this.play(sim, { x: hands.x, y: hands.y - this.court.releaseHeight });
    return sim;
  }

  /**
   * Animates a shot simulated elsewhere (e.g. an opponent's shot, straight
   * from the server). Returns false if a ball is already in the air.
   */
  playSim(sim: ShotSim): boolean {
    if (this.phase === "flying") return false;
    this.play(sim, { x: 0, y: 0 });
    return true;
  }

  private play(sim: ShotSim, handOffset: { x: number; y: number }) {
    this.dribble = null;
    this.handOffset = handOffset;
    this.sim = sim;
    this.launchedAt = this.now;
    this.eventIdx = 0;
    this.resultSent = false;
    this.phase = "flying";
    this.trail = [];
    sfx.release();
    this.cb.onLaunch?.(sim);
  }

  /** Live (smoothed) pose: drives the shooter silhouette and where the ball sits. */
  setPose(pose: NormalizedLandmark[] | undefined) {
    this.pose = pose;
  }

  /** Reserve `px` on the left (e.g. under the camera preview) so it never covers the player. */
  setLeftInset(px: number) {
    this.leftInset = Math.max(0, Math.min(px, this.w * 0.45));
  }

  setAvatar(look: Avatar) {
    this.look = look;
  }

  /**
   * The player patted the ball down (DribbleDetector): it drops from that
   * hand to the floor and comes back up over one beat of their rhythm.
   * Cosmetic; only while the ball is in hand and the camera sees the player.
   */
  bounce(hand: Side, strength: number, intervalMs: number | null) {
    if (this.phase !== "ready" || this.paused || !this.avatar().live) return;
    const period = Math.min(DRIBBLE_MS.max, Math.max(DRIBBLE_MS.min, intervalMs ?? DRIBBLE_MS.fallback));
    this.dribble = { hand, start: this.now, period, strength, hit: false };
  }

  /** Keyboard charge 0..1 (null = not charging). */
  setCharge(c: number | null) {
    this.charge = c;
  }

  /** "Loaded" glow on the ball when the detector is in WINDUP. */
  setLoaded(v: boolean) {
    this.loaded = v;
  }

  /** Flickering orange halo on the ball while the hot hand is on (solo). */
  setHot(v: boolean) {
    this.hot = v;
  }

  // ── World ↔ screen ──

  /** Hoop centre right now (moves on harder levels). */
  private get hoopX() {
    return this.court.hoopDistance + hoopOffset(this.court, this.hoopPhase);
  }

  private get boardX() {
    return this.hoopX + this.court.rimRadius + this.court.boardGap;
  }

  /** Board position at rest: frames the camera so a moving hoop doesn't move the view. */
  private get restBoardX() {
    return this.court.hoopDistance + this.court.rimRadius + this.court.boardGap + (this.court.hoopMotion?.amplitude ?? 0);
  }

  private view() {
    // Portrait screens get a tighter crop so the court isn't tiny.
    const portrait = this.h > this.w;
    const inset = this.leftInset;
    const avail = this.w - inset;
    const left = portrait || inset ? -0.9 : -1.9;
    const right = this.restBoardX + (portrait ? 0.75 : 1.5);
    const top = portrait ? 4.6 : 5.3;
    const floorY = this.h * (portrait ? 0.72 : 0.86);
    const s = Math.min(avail / (right - left), floorY / top);
    const ox = inset + (avail - (right - left) * s) / 2 - left * s;
    return { s, ox, floorY };
  }

  private X(x: number) {
    const v = this.view();
    return v.ox + x * v.s;
  }

  private Y(y: number) {
    const v = this.view();
    return v.floorY - y * v.s;
  }

  // ── Update ──

  private update() {
    const dt = 1 / 60;
    if (this.phase === "flying" && this.sim) {
      const t = (this.now - this.launchedAt) / 1000;
      const p = this.sample(t);
      // Blend from where the hands were to the physics release point.
      const k = Math.max(0, 1 - t / HAND_BLEND_S);
      this.ball.x = p.x + this.handOffset.x * k;
      this.ball.y = p.y + this.handOffset.y * k;
      this.ball.rot = -t * 14; // backspin
      this.trail.push({ x: this.ball.x, y: this.ball.y });
      if (this.trail.length > 14) this.trail.shift();

      while (this.eventIdx < this.sim.events.length && this.sim.events[this.eventIdx].t <= t) {
        this.onEvent(this.sim.events[this.eventIdx++]);
      }
      if (t >= this.sim.duration) {
        if (!this.resultSent) {
          this.resultSent = true;
          this.missFeedback(this.sim);
          this.cb.onResult?.(this.sim);
        }
        this.ghost = this.sim.path;
        this.phase = "result";
        this.respawnAt = this.now + RESPAWN_MS;
      }
    } else if (this.phase === "result" && this.now >= this.respawnAt) {
      this.phase = "ready";
      this.trail = [];
      this.cb.onReady?.();
    }
    if (this.phase === "ready" && this.dribble && !this.updateDribble()) this.dribble = null;
    if (this.phase === "ready" && !this.dribble) {
      const hands = this.handsWorld();
      this.ball.x = hands.x;
      this.ball.y = hands.y + Math.sin(this.now / 400) * 0.01;
      this.ball.rot = Math.sin(this.now / 900) * 0.2;
    }

    for (const p of this.particles) {
      p.vy -= 9.81 * dt * 0.6;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.texts = this.texts.filter((t) => this.now - t.born < 1600);
  }

  /** Moves the ball through the current dribble. Returns false once it's back in hand. */
  private updateDribble() {
    const d = this.dribble!;
    const k = (this.now - d.start) / d.period;
    if (k >= 1) return false;
    const { pts, live } = this.avatar();
    if (!live) return false;
    const wrist = pts[d.hand === "left" ? 15 : 16];
    const r = this.court.ballRadius;
    // Under the palm, never above the shooting pocket or below the floor.
    const top = Math.max(r * 2, Math.min(2.2, wrist.y - r * 0.8));
    let y: number;
    if (k < DRIBBLE_DOWN) {
      const u = k / DRIBBLE_DOWN;
      y = top - (top - r) * u * u; // pushed: speeds up on the way down
    } else {
      const u = (k - DRIBBLE_DOWN) / (1 - DRIBBLE_DOWN);
      y = r + (top - r) * (1 - (1 - u) * (1 - u)); // rebounds, slowing into the hand
      if (!d.hit) {
        d.hit = true;
        sfx.bounce(2 + d.strength * 4);
      }
    }
    this.ball.x = wrist.x;
    this.ball.y = y;
    this.ball.rot += 0.08;
    return true;
  }

  private sample(t: number) {
    const path = this.sim!.path;
    if (path.length < 2) return { x: path[0][1], y: path[0][2] };
    // Binary search by time: works for local 120 Hz paths and server 60 Hz ones.
    let lo = 0;
    let hi = path.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (path[mid][0] <= t) lo = mid;
      else hi = mid - 1;
    }
    const i = lo;
    const [t0, x0, y0] = path[i];
    const [t1, x1, y1] = path[i + 1];
    const k = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1;
    return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k };
  }

  private onEvent(e: ShotEvent) {
    const sim = this.sim!;
    switch (e.type) {
      case "rim":
        sfx.rim(e.impact);
        this.burst(e.x, e.y, 6, C.sun, 1.2);
        this.netKick = Math.max(this.netKick, 0.4);
        this.netKickAt = this.now;
        break;
      case "board":
        sfx.board(e.impact);
        this.burst(e.x, e.y, 5, C.cream, 1);
        break;
      case "floor":
        sfx.bounce(e.impact);
        break;
      case "score": {
        const r = sim.result;
        if (r.swish) sfx.swish();
        else sfx.rim(2);
        sfx.cheer(r.swish);
        this.netKick = 1;
        this.netKickAt = this.now;
        this.burst(e.x, this.court.rimHeight - 0.2, r.swish ? 40 : 24, r.swish ? C.sun : C.cream, 2.6);
        let label: string | void = undefined;
        if (!this.resultSent) {
          this.resultSent = true;
          label = this.cb.onResult?.(sim);
        }
        this.texts.push({
          text: r.swish ? "SWISH!" : r.bank ? "BANK!" : "BUCKET!",
          sub: label || (r.swish ? "+3" : "+2"),
          x: e.x,
          y: this.court.rimHeight + 0.7,
          born: this.now,
          color: r.swish ? C.sun : C.cream,
        });
        break;
      }
    }
  }

  private missFeedback(sim: ShotSim) {
    const r = sim.result;
    if (r.scored) return;
    const label = { short: "SHORT", long: "LONG", rim: "RIM OUT", airball: "AIRBALL" }[r.miss ?? "short"];
    this.texts.push({ text: label, x: this.hoopX - 0.4, y: this.court.rimHeight + 0.6, born: this.now, color: "rgba(247,241,214,.85)" });
  }

  private burst(x: number, y: number, n: number, color: string, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random());
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 1, life: 0.6 + Math.random() * 0.6, max: 1.2, size: 1.5 + Math.random() * 2.5, color });
    }
  }

  /** Where the hands are (midpoint of wrists); the ball sits there until released. */
  private handsWorld() {
    const fallback = { x: 0, y: this.court.releaseHeight };
    if (!this.pose) return fallback;
    const { pts } = this.avatar();
    const x = (pts[15].x + pts[16].x) / 2;
    const y = (pts[15].y + pts[16].y) / 2;
    // Keep the ball near the release point so the launch blend stays short.
    return { x: Math.max(-0.6, Math.min(0.4, x)), y: Math.max(1.2, Math.min(2.6, y)) };
  }

  /**
   * Player joints in world space. Live pose is mapped mirror-style (torso
   * length → 0.55 m, shoulders anchored by the shooting spot); any joint the
   * camera can't see falls back to a natural set-shot pose.
   */
  private avatar(): { pts: Record<number, Vec>; live: boolean } {
    const p = this.pose;
    const pts: Record<number, Vec> = { ...DEFAULT_POSE };
    if (!p) return { pts, live: false };
    const ls = p[11];
    const rs = p[12];
    const lh = p[23];
    const rh = p[24];
    if (!ls || !rs || (ls.visibility ?? 0) < 0.5 || (rs.visibility ?? 0) < 0.5) return { pts, live: false };
    const aspect = 16 / 9;
    const sx = (ls.x + rs.x) / 2;
    const sy = (ls.y + rs.y) / 2;
    const hipsOk = lh && rh && (lh.visibility ?? 0) > 0.4 && (rh.visibility ?? 0) > 0.4;
    const torso = hipsOk ? Math.hypot(((lh.x + rh.x) / 2 - sx) * aspect, (lh.y + rh.y) / 2 - sy) : 0;
    const k = 0.55 / (torso || 0.3);
    const anchor = { x: -0.3, y: 1.5 };
    for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24]) {
      const lm = p[i];
      if (!lm || (lm.visibility ?? 0) < 0.4) continue;
      // Mirror x (feels like a mirror), flip y (world is y-up).
      pts[i] = { x: anchor.x - (lm.x - sx) * aspect * k, y: anchor.y - (lm.y - sy) * k };
    }
    if (!hipsOk) {
      pts[23] = { x: pts[11].x + 0.03, y: pts[11].y - 0.55 };
      pts[24] = { x: pts[12].x - 0.03, y: pts[12].y - 0.55 };
    }
    return { pts, live: true };
  }

  // ── Draw ──

  private draw() {
    const { ctx, w, dpr } = this;
    if (!w) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { s, floorY } = this.view();

    if (!this.bg) this.bg = this.renderBackground();
    ctx.drawImage(this.bg, 0, 0, w, this.h);
    this.drawSpotlight(s);
    this.drawGhost(s);
    this.drawStand(s);
    this.drawRim("back", s);
    this.drawAvatar(s);
    this.drawBallShadow(s, floorY);
    this.drawTrail(s);
    this.drawBall(s);
    this.drawNet(s);
    this.drawRim("front", s);
    this.drawParticles(s);
    this.drawTexts(s);
    if (this.charge !== null && this.phase === "ready") this.drawCharge(s);
  }

  /** Scenery + floor never change during play: draw once into an offscreen canvas. */
  private renderBackground() {
    const off = document.createElement("canvas");
    off.width = Math.round(this.w * this.dpr);
    off.height = Math.round(this.h * this.dpr);
    const ctx = off.getContext("2d")!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const { s, floorY } = this.view();
    drawScenery(ctx, this.theme, { w: this.w, h: this.h, floorY, s, X: (x) => this.X(x), hoopDistance: this.court.hoopDistance });
    return off;
  }

  /** Spotlight follows the (possibly moving) hoop, so it's drawn live. */
  private drawSpotlight(s: number) {
    const { ctx, w, h, theme } = this;
    const hx = this.X(this.hoopX);
    const hy = this.Y(this.court.rimHeight + 0.6);
    const spot = ctx.createRadialGradient(hx, hy, 0, hx, hy, 4.2 * s);
    spot.addColorStop(0, `rgba(${theme.spot},${theme.spotAlpha})`);
    spot.addColorStop(1, `rgba(${theme.spot},0)`);
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, w, h);
  }

  private drawGhost(s: number) {
    if (!this.ghost || this.phase === "flying") return;
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = this.theme.ghost;
    ctx.setLineDash([2, s * 0.08]);
    ctx.lineWidth = Math.max(1.5, s * 0.02);
    ctx.lineCap = "round";
    ctx.beginPath();
    this.ghost.forEach(([, x, y], i) => (i ? ctx.lineTo(this.X(x), this.Y(y)) : ctx.moveTo(this.X(x), this.Y(y))));
    ctx.stroke();
    ctx.restore();
  }

  private drawStand(s: number) {
    const { ctx } = this;
    const c = this.court;
    const bx = this.boardX;
    const lo = c.rimHeight + c.boardBottom;
    const hi = c.rimHeight + c.boardTop;
    const poleX = bx + 1.0;
    ctx.fillStyle = this.theme.pole;
    ctx.fillRect(this.X(poleX) - s * 0.07, this.Y(hi - 0.25), s * 0.14, this.Y(0) - this.Y(hi - 0.25));
    ctx.strokeStyle = this.theme.arm;
    ctx.lineWidth = s * 0.08;
    ctx.beginPath();
    ctx.moveTo(this.X(poleX), this.Y(hi - 0.3));
    ctx.lineTo(this.X(bx + 0.2), this.Y((lo + hi) / 2));
    ctx.stroke();
    ctx.fillStyle = C.hoop;
    ctx.fillRect(this.X(poleX) - s * 0.12, this.Y(1.1), s * 0.24, this.Y(0) - this.Y(1.1));

    // Wind pennant on top of the pole: points downwind, longer when stronger.
    const top = { x: poleX, y: hi + 0.35 };
    ctx.strokeStyle = "#2b2b2a";
    ctx.lineWidth = s * 0.025;
    ctx.beginPath();
    ctx.moveTo(this.X(poleX), this.Y(hi - 0.25));
    ctx.lineTo(this.X(top.x), this.Y(top.y));
    ctx.stroke();
    const strength = Math.min(1, Math.abs(this.wind) / 1.2);
    const dir = this.wind === 0 ? 0 : Math.sign(this.wind);
    const flap = Math.sin(this.now / (90 - strength * 40)) * 0.03 * (0.3 + strength);
    const len = 0.12 + strength * 0.3;
    const tipX = dir ? top.x + dir * len : top.x + 0.04;
    const tipY = dir ? top.y - 0.06 + flap : top.y - 0.22;
    ctx.fillStyle = this.wind === 0 ? "rgba(247,241,214,0.35)" : C.sun;
    ctx.beginPath();
    ctx.moveTo(this.X(top.x), this.Y(top.y));
    ctx.lineTo(this.X(tipX), this.Y(tipY));
    ctx.lineTo(this.X(top.x), this.Y(top.y - 0.12));
    ctx.closePath();
    ctx.fill();

    // Glass backboard as a slab seen slightly from the front.
    const depth = { x: 0.32, y: 0.1 };
    ctx.beginPath();
    ctx.moveTo(this.X(bx), this.Y(lo));
    ctx.lineTo(this.X(bx), this.Y(hi));
    ctx.lineTo(this.X(bx + depth.x), this.Y(hi + depth.y));
    ctx.lineTo(this.X(bx + depth.x), this.Y(lo + depth.y));
    ctx.closePath();
    ctx.fillStyle = this.theme.glassFill;
    ctx.fill();
    ctx.strokeStyle = this.theme.glass;
    ctx.lineWidth = Math.max(1.5, s * 0.02);
    ctx.stroke();
    const sq = (u: number, v: number) => [this.X(bx + depth.x * u), this.Y(lo + (hi - lo) * v + depth.y * u)] as const;
    ctx.strokeStyle = C.hoop;
    ctx.lineWidth = Math.max(1.5, s * 0.018);
    ctx.beginPath();
    ctx.moveTo(...sq(0.3, 0.12));
    ctx.lineTo(...sq(0.3, 0.55));
    ctx.lineTo(...sq(0.7, 0.55));
    ctx.lineTo(...sq(0.7, 0.12));
    ctx.stroke();
    ctx.strokeStyle = "#444";
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.moveTo(this.X(bx), this.Y(c.rimHeight - 0.05));
    ctx.lineTo(this.X(this.hoopX + c.rimRadius), this.Y(c.rimHeight));
    ctx.stroke();
  }

  private rimEllipse(s: number) {
    const c = this.court;
    return { cx: this.X(this.hoopX), cy: this.Y(c.rimHeight), rx: c.rimRadius * s, ry: c.rimRadius * s * 0.28 };
  }

  private drawRim(half: "back" | "front", s: number) {
    const { ctx } = this;
    const e = this.rimEllipse(s);
    ctx.strokeStyle = half === "front" ? C.hoop : "#a3260f";
    ctx.lineWidth = Math.max(2.5, s * 0.035);
    ctx.lineCap = "round";
    ctx.beginPath();
    if (half === "back") ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, Math.PI, Math.PI * 2);
    else ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI);
    ctx.stroke();
  }

  private drawNet(s: number) {
    const { ctx } = this;
    const e = this.rimEllipse(s);
    const since = (this.now - this.netKickAt) / 1000;
    const kick = this.netKick * Math.exp(-since * 3.2);
    const sway = Math.sin(since * 16) * kick;
    const depth = 0.42 * s * (1 + kick * 0.35);
    const n = 9;
    const top: [number, number][] = [];
    const mid: [number, number][] = [];
    const bot: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (i / (n - 1));
      const cx = Math.cos(a);
      top.push([e.cx + cx * e.rx, e.cy + Math.sin(a) * e.ry]);
      mid.push([e.cx + cx * e.rx * 0.8 + sway * s * 0.06, e.cy + depth * 0.5 + Math.sin(a) * e.ry * 0.7]);
      bot.push([e.cx + cx * e.rx * 0.58 + sway * s * 0.1, e.cy + depth + Math.sin(a) * e.ry * 0.5]);
    }
    ctx.strokeStyle = this.theme.net;
    ctx.lineWidth = Math.max(1, s * 0.01);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const j = Math.min(n - 1, i + 1);
      const k = Math.max(0, i - 1);
      ctx.moveTo(...top[i]);
      ctx.lineTo(...mid[j]);
      ctx.moveTo(...top[i]);
      ctx.lineTo(...mid[k]);
      ctx.moveTo(...mid[i]);
      ctx.lineTo(...bot[j]);
      ctx.moveTo(...mid[i]);
      ctx.lineTo(...bot[k]);
    }
    ctx.stroke();
    ctx.beginPath();
    bot.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }

  /** The player (look from the profile), upper body following the live pose. */
  private drawAvatar(s: number) {
    drawPlayer(this.ctx, this.avatar().pts, this.look, { X: (x) => this.X(x), Y: (y) => this.Y(y), s, font: this.font });
  }

  private drawBallShadow(s: number, floorY: number) {
    const { ctx } = this;
    const h = Math.max(0, this.ball.y);
    const k = Math.max(0.15, 1 - h / 5);
    ctx.fillStyle = `rgba(0,0,0,${0.35 * k})`;
    ctx.beginPath();
    ctx.ellipse(this.X(this.ball.x), floorY + 3, this.court.ballRadius * s * (1.4 - k * 0.4), this.court.ballRadius * s * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawTrail(s: number) {
    const { ctx } = this;
    const r = this.court.ballRadius * s;
    this.trail.forEach((p, i) => {
      const a = (i / this.trail.length) * 0.22;
      ctx.fillStyle = `rgba(246,161,58,${a})`;
      ctx.beginPath();
      ctx.arc(this.X(p.x), this.Y(p.y), r * (0.4 + (i / this.trail.length) * 0.6), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawBall(s: number) {
    const { ctx } = this;
    const r = Math.max(5, this.court.ballRadius * s);
    const x = this.X(this.ball.x);
    const y = this.Y(this.ball.y);
    if (this.phase === "result" && this.sim?.result.scored === false && this.now - this.respawnAt > -200) {
      ctx.globalAlpha = Math.max(0, (this.respawnAt - this.now) / 200);
    }
    if (this.hot && this.phase === "ready") {
      const flicker = 1 + Math.sin(this.now / 60) * 0.06 + Math.sin(this.now / 23) * 0.04;
      const halo = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 2.4 * flicker);
      halo.addColorStop(0, "rgba(255,120,30,0.55)");
      halo.addColorStop(1, "rgba(255,60,0,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.4 * flicker, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.loaded && this.phase === "ready") {
      const pulse = 1 + Math.sin(this.now / 140) * 0.08;
      ctx.strokeStyle = "rgba(255,225,77,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.6 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, "#ffb070");
    g.addColorStop(0.55, C.ball);
    g.addColorStop(1, "#8f3410");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.ball.rot);
    ctx.strokeStyle = "rgba(30,12,4,0.65)";
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.moveTo(0, -r);
    ctx.lineTo(0, r);
    ctx.moveTo(-r * 0.55, -r * 0.83);
    ctx.quadraticCurveTo(-r * 0.15, 0, -r * 0.55, r * 0.83);
    ctx.moveTo(r * 0.55, -r * 0.83);
    ctx.quadraticCurveTo(r * 0.15, 0, r * 0.55, r * 0.83);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawParticles(s: number) {
    const { ctx } = this;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(this.X(p.x), this.Y(p.y), p.size * Math.max(1, s / 150), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawTexts(s: number) {
    const { ctx } = this;
    for (const t of this.texts) {
      const age = (this.now - t.born) / 1000;
      const a = age < 0.15 ? age / 0.15 : Math.max(0, 1 - (age - 0.9) / 0.7);
      const pop = age < 0.15 ? 0.6 + (age / 0.15) * 0.5 : 1.1 - Math.min(0.1, (age - 0.15) * 0.2);
      const x = this.X(t.x);
      const y = this.Y(t.y + age * 0.35);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x, y);
      ctx.scale(pop, pop);
      ctx.textAlign = "center";
      ctx.fillStyle = t.color;
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 12;
      ctx.font = `${Math.round(s * 0.42)}px ${this.font}`;
      ctx.fillText(t.text, 0, 0);
      if (t.sub) {
        ctx.font = `${Math.round(s * 0.26)}px ${this.font}`;
        ctx.fillStyle = C.cream;
        ctx.fillText(t.sub, 0, s * 0.3);
      }
      ctx.restore();
    }
  }

  private drawCharge(s: number) {
    const { ctx } = this;
    const x = this.X(this.ball.x);
    const y = this.Y(this.ball.y);
    const r = this.court.ballRadius * s * 2.2;
    ctx.lineWidth = Math.max(3, s * 0.04);
    ctx.strokeStyle = "rgba(247,241,214,0.15)";
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();
    ctx.strokeStyle = C.sun;
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (this.charge ?? 0));
    ctx.stroke();
  }
}
