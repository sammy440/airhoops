import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { Side } from "@/lib/pose/kinematics";
import { DEFAULT_AVATAR, type Avatar } from "./avatar";
import { COURT_THEMES, DEFAULT_COURT_THEME, type CourtTheme, type CourtThemeId } from "./courts";
import { DEFAULT_COURT, hoopOffset, simulateShot, type Court, type Launch, type PathPoint, type ShotEvent, type ShotSim } from "./physics";
import { sfx } from "./sfx";

/**
 * What every renderer shares: the game clock, shot playback, events and results,
 * respawn, dribbles, particles and floating text. Renderers (2D canvas, 3D WebGL)
 * extend it and only draw.
 *
 * World units are meters, the physics' axes: x = toward the hoop, y = up,
 * z = sideways (+ = the shooter's right). Physics never runs per-frame: each throw
 * is simulated once (simulateShot) and played back by wall-clock time, the same way
 * multiplayer plays server-authoritative paths.
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

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Particle extends Vec3 {
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

export interface FloatText extends Vec3 {
  text: string;
  sub?: string;
  born: number;
  color: string;
}

export interface Dribble {
  hand: Side;
  start: number;
  period: number;
  strength: number;
  hit: boolean;
}

export const COLORS = {
  hoop: "#ea3a1d",
  ball: "#f07b2c",
  cream: "#f7f1d6",
  sun: "#f6a13a",
  ink: "#0e0e0d",
};
export const MISS_LABELS = { short: "SHORT", long: "LONG", left: "WIDE LEFT", right: "WIDE RIGHT", rim: "RIM OUT", airball: "AIRBALL" } as const;
const RESPAWN_MS = 650;
/** Makes in a row to catch fire: the ×2 streak tier (scoring.ts). */
export const ON_FIRE = 5;
const HAND_BLEND_S = 0.12;
/** A dribble lasts one beat of the player's rhythm, within these limits. */
const DRIBBLE_MS = { min: 280, max: 800, fallback: 450 };
/** Fraction of the beat spent going down (pushed), the rest coming back up. */
const DRIBBLE_DOWN = 0.42;

/** Position along a path at time t (binary search: works for local 120 Hz paths and server 60 Hz ones). */
export function samplePath(path: PathPoint[], t: number): Vec3 {
  if (path.length < 2) return { x: path[0][1], y: path[0][2], z: path[0][3] ?? 0 };
  let lo = 0;
  let hi = path.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (path[mid][0] <= t) lo = mid;
    else hi = mid - 1;
  }
  const [t0, x0, y0, z0 = 0] = path[lo];
  const [t1, x1, y1, z1 = 0] = path[lo + 1];
  const k = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1;
  return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, z: z0 + (z1 - z0) * k };
}

export abstract class GameCore {
  court: Court;
  phase: GamePhase = "ready";
  /** Paused games freeze the clock: flight, hoop motion and timers all stop. */
  paused = false;

  protected w = 0;
  protected h = 0;
  private raf = 0;
  /** Game clock (ms). Advances only while unpaused, so pausing freezes everything. */
  protected now = 0;
  private lastTs = 0;
  /** Crosswind (m/s²) applied to the next shot and shown by the flag. */
  protected wind = 0;

  protected sim: ShotSim | null = null;
  private launchedAt: number | null = null;
  private eventIdx = 0;
  private resultSent = false;
  protected respawnAt = 0;
  private handOffset: Vec3 = { x: 0, y: 0, z: 0 };

  protected ball = { x: 0, y: 0, z: 0, rot: 0 };
  protected trail: Vec3[] = [];
  protected ghost: PathPoint[] | null = null;
  protected particles: Particle[] = [];
  protected texts: FloatText[] = [];
  protected netKick = 0;
  protected netKickAt = -1e9;
  protected theme: CourtTheme = COURT_THEMES[DEFAULT_COURT_THEME];

  protected pose: NormalizedLandmark[] | undefined;
  /** Screen pixels on the left covered by UI (camera preview); the court fits beside it. */
  protected leftInset = 0;
  protected charge: number | null = null;
  /** Ball bouncing from one hand to the floor and back (see bounce()). */
  protected dribble: Dribble | null = null;
  /** Body, skin, hair and kit (see avatar.ts). */
  protected look: Avatar = DEFAULT_AVATAR;
  protected loaded = false;
  protected hot = false;
  /** Where the next shot will go sideways (launch aim, degrees, + = right); null hides the guide. */
  protected aim: number | null = null;
  /** Makes in a row before the current shot (solo, or yours in a match). */
  protected streak = 0;
  /** Game clock (ms) of the last make, for the camera punch. */
  protected madeAt = -1e9;

  /**
   * Hoop-motion phase (s). Multiplayer points this at the server's match
   * clock so a moving hoop is in the same place for everyone.
   */
  private phaseSource: (() => number | null) | null = null;

  constructor(
    protected cb: GameCallbacks = {},
    court: Court = DEFAULT_COURT,
  ) {
    this.court = court;
    this.ball = { x: 0, y: court.releaseHeight, z: 0, rot: 0 };
  }

  // ── What a renderer provides ──

  abstract resize(cssW: number, cssH: number, dpr?: number): void;
  protected abstract render(): void;
  /** Where the ball sits in the player's hands (world). */
  protected abstract handsWorld(): Vec3;
  /** A wrist in world space while the camera sees the player, else null. */
  protected abstract wristWorld(hand: Side): Vec3 | null;
  /** Free GPU / canvas resources. */
  protected dispose() {}
  /** Something the renderer caches depends on the court or theme. */
  protected sceneChanged() {}

  // ── Public API ──

  start() {
    const loop = (ts: number) => {
      const dt = this.lastTs ? Math.min(100, ts - this.lastTs) : 16;
      this.lastTs = ts;
      if (!this.paused) this.now += dt;
      if (!document.hidden) {
        this.update();
        this.render();
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.dispose();
  }

  setPaused(p: boolean) {
    this.paused = p;
  }

  /** Switch difficulty: new distance / rim / motion. Clears the old ghost path. */
  setCourt(court: Court) {
    this.court = court;
    this.ghost = null;
    this.sceneChanged();
  }

  /** Cosmetic court scenery (see courts.ts). */
  setTheme(id: CourtThemeId) {
    if (this.theme.id === id) return;
    this.theme = COURT_THEMES[id];
    this.sceneChanged();
  }

  setWind(w: number) {
    this.wind = w;
  }

  /** Game clock in seconds (the phase a moving hoop is at). */
  get clock() {
    return this.now / 1000;
  }

  setPhaseSource(fn: (() => number | null) | null) {
    this.phaseSource = fn;
  }

  get hoopPhase() {
    return this.phaseSource?.() ?? this.clock;
  }

  canThrow() {
    return this.phase === "ready" && !this.paused;
  }

  /** A shot is in the air (its result hasn't been reported yet). */
  get ballInFlight() {
    return this.phase === "flying" && !this.resultSent;
  }

  /** Seconds since the last ball left the hands (null before the first), on the pause-aware clock. */
  protected get sinceLaunch(): number | null {
    return this.launchedAt === null ? null : (this.now - this.launchedAt) / 1000;
  }

  /** Simulates and launches a shot. Returns the simulation, or null if a ball is in flight. */
  throwBall(launch: Launch): ShotSim | null {
    if (!this.canThrow()) return null;
    const sim = simulateShot(launch, this.court, { wind: this.wind, phase: this.hoopPhase });
    const hands = this.handsWorld();
    this.play(sim, { x: hands.x, y: hands.y - this.court.releaseHeight, z: hands.z });
    return sim;
  }

  /**
   * Animates a shot simulated elsewhere (e.g. an opponent's shot, straight
   * from the server). Returns false if a ball is already in the air.
   */
  playSim(sim: ShotSim): boolean {
    if (this.phase === "flying") return false;
    this.play(sim, { x: 0, y: 0, z: 0 });
    return true;
  }

  /** Live (smoothed) pose: drives the shooter and where the ball sits. */
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
    if (this.phase !== "ready" || this.paused || !this.wristWorld(hand)) return;
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

  /** Makes in a row: ON_FIRE and up sets the ball and rim alight. */
  setStreak(n: number) {
    if (n >= ON_FIRE && this.streak < ON_FIRE) sfx.fire();
    this.streak = n;
  }

  get onFire() {
    return this.streak >= ON_FIRE;
  }

  /** The aim guide on the floor (3D only): launch aim in degrees, or null to hide it. */
  setAim(deg: number | null) {
    this.aim = deg;
  }

  // ── Update ──

  private play(sim: ShotSim, handOffset: Vec3) {
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

  private update() {
    const dt = 1 / 60;
    if (this.phase === "flying" && this.sim) {
      const t = this.sinceLaunch!;
      const p = samplePath(this.sim.path, t);
      // Blend from where the hands were to the physics release point.
      const k = Math.max(0, 1 - t / HAND_BLEND_S);
      this.ball.x = p.x + this.handOffset.x * k;
      this.ball.y = p.y + this.handOffset.y * k;
      this.ball.z = p.z + this.handOffset.z * k;
      this.ball.rot = -t * 14; // backspin
      this.trail.push({ x: this.ball.x, y: this.ball.y, z: this.ball.z });
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
      this.ball.z = hands.z;
      this.ball.rot = Math.sin(this.now / 900) * 0.2;
    }

    for (const p of this.particles) {
      p.vy -= 9.81 * dt * 0.6;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
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
    const wrist = this.wristWorld(d.hand);
    if (!wrist) return false;
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
    this.ball.z = wrist.z;
    this.ball.rot += 0.08;
    return true;
  }

  private onEvent(e: ShotEvent) {
    const sim = this.sim!;
    const z = e.z ?? 0;
    switch (e.type) {
      case "rim":
        sfx.rim(e.impact);
        this.burst({ x: e.x, y: e.y, z }, 6, COLORS.sun, 1.2);
        this.netKick = Math.max(this.netKick, 0.4);
        this.netKickAt = this.now;
        break;
      case "board":
        sfx.board(e.impact);
        this.burst({ x: e.x, y: e.y, z }, 5, COLORS.cream, 1);
        break;
      case "floor":
        sfx.bounce(e.impact);
        break;
      case "score": {
        const r = sim.result;
        if (r.swish) sfx.swish();
        else sfx.rim(2);
        sfx.cheer(r.swish, Math.min(1, (this.streak + 1) / 10));
        this.netKick = 1;
        this.netKickAt = this.now;
        this.madeAt = this.now;
        this.burst({ x: e.x, y: this.court.rimHeight - 0.2, z }, r.swish ? 40 : 24, r.swish ? COLORS.sun : COLORS.cream, 2.6);
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
          z,
          born: this.now,
          color: r.swish ? COLORS.sun : COLORS.cream,
        });
        break;
      }
    }
  }

  private missFeedback(sim: ShotSim) {
    const r = sim.result;
    if (r.scored) return;
    if (this.streak >= 3) sfx.groan();
    const label = MISS_LABELS[r.miss ?? "short"];
    // Over the hoop, wherever it has slid to.
    const z = hoopOffset(this.court, this.hoopPhase);
    this.texts.push({ text: label, x: this.court.hoopDistance - 0.4, y: this.court.rimHeight + 0.6, z, born: this.now, color: "rgba(247,241,214,.85)" });
  }

  private burst(at: Vec3, n: number, color: string, speed: number) {
    for (let i = 0; i < n; i++) {
      // Random direction on a sphere, biased upward.
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const v = speed * (0.4 + Math.random());
      this.particles.push({
        ...at,
        vx: Math.sin(b) * Math.cos(a) * v,
        vy: Math.cos(b) * v + 1,
        vz: Math.sin(b) * Math.sin(a) * v,
        life: 0.6 + Math.random() * 0.6,
        max: 1.2,
        size: 1.5 + Math.random() * 2.5,
        color,
      });
    }
  }
}
