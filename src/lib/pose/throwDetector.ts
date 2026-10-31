import type { ArmKinematics, KinematicsFrame, Side, Vec2 } from "./kinematics";

/**
 * Throw detector state machine.
 *
 *   IDLE ⇄ PICKUP ⇄ WINDUP   (informational: where the hand is)
 *     └──(arm extending fast, wrist ≥ ~shoulder)──► THROW
 *   THROW ──(extension peaks or speed collapses)──► validate ──► emit ThrowEvent
 *   COOLDOWN ──(800 ms)──► IDLE           THROW ──(> 900 ms)──► IDLE (timeout)
 *
 * Why it differs from the README sketch: in the first recordings players held
 * the "ball" at head height and pushed, so the wrist never dropped below the
 * hip. PICKUP is tracked (it's reported on the event) but not required.
 *
 * A second trigger, the elbow snap, catches pushes towards the camera, which look
 * short in 2D (little reach gained): both hands hold the ball overhead with the
 * elbow bent and still, then the elbow straightens quickly and the wrist rises.
 *
 * Power comes from the arm's speed relative to the shoulders; a jump (the
 * shoulders rising fast just before release) adds to it, so jumping throws
 * further but isn't needed to throw.
 *
 * The Python lab has a line-for-line port (lab/airhoops_lab/detector.py) used
 * for tuning; a parity test replays real recordings through both.
 */

export type DetectorState = "IDLE" | "PICKUP" | "WINDUP" | "THROW" | "COOLDOWN";

/** A detected throw, plus diagnostics for the lab. */
export interface ThrowEvent {
  /** 0..1 */
  power: number;
  /** Degrees above horizontal of the throw's average direction */
  angle: number;
  /** 0..1 — how high the hand was at release */
  arc: number;
  hand: Side;
  /** ms timestamp (performance.now() timebase) */
  t: number;
  peakSpeed: number;
  /** Peak wrist speed relative to the shoulders (a jump doesn't count), torso lengths/s */
  armSpeed: number;
  /** 0..1: how hard the player jumped into the shot */
  jump: number;
  /** Shoulders over hips at release, torso lengths, image x (null if not visible): the aim */
  lean: number | null;
  extension: number;
  height: number;
  pickedUp: boolean;
  durationMs: number;
}

export interface ThrowParams {
  // Entering THROW
  startSpeed: number;
  minHeightStart: number;
  setWindowMs: number;
  maxSetSpeed: number;
  // Validating a release
  minPeakSpeed: number;
  minExtension: number;
  minExtensionGain: number;
  minReleaseHeight: number;
  minAngle: number;
  /** A release below minReleaseHeight still counts from here up, if it goes up at ≥ lowReleaseMinAngle. */
  lowReleaseHeight: number;
  lowReleaseMinAngle: number;
  // Ending THROW
  extensionDrop: number;
  speedDropRatio: number;
  minThrowMs: number;
  maxThrowMs: number;
  lookbackMs: number;
  cooldownMs: number;
  // Informational states
  pickupBelowHip: number;
  windupHeight: number;
  windupMaxSpeed: number;
  pickupMemoryMs: number;
  // Power mapping (arm speed relative to the shoulders)
  powerMinSpeed: number;
  powerMaxSpeed: number;
  // Elbow snap
  snapBent: number;
  snapStraight: number;
  snapSetHeight: number;
  snapReleaseHeight: number;
  snapMaxHandsApart: number;
  snapMinRise: number;
  snapMinRate: number;
  snapWindowMs: number;
  snapHoldMs: number;
  // Jump
  jumpMinRise: number;
  jumpFullRise: number;
  jumpWindowMs: number;
  jumpPower: number;
}

/** Units: speeds in torso lengths/s, distances in torso lengths. See CHANGELOG.md. */
export const DEFAULT_THROW_PARAMS: ThrowParams = {
  startSpeed: 1.5,
  minHeightStart: -0.35,
  // "Set point": a shot starts from a (nearly) still hand. Waving never pauses.
  setWindowMs: 300,
  maxSetSpeed: 1.2,
  minPeakSpeed: 1.8,
  // 2D reach: a push towards the camera looks shorter than it is, so keep this modest.
  minExtension: 0.5,
  minExtensionGain: 0.12,
  minReleaseHeight: 0.4,
  // Shots go up; sideways swipes are waves.
  minAngle: 5,
  // Beginners push from the chest: a lower release counts if it goes clearly up.
  // The waves that pass a lower height alone move at 11–22°, so they still fail.
  lowReleaseHeight: 0,
  lowReleaseMinAngle: 30,
  extensionDrop: 0.04,
  // Fire as the arm decelerates, not after it has stopped (~30 ms sooner than 0.45).
  speedDropRatio: 0.7,
  minThrowMs: 100,
  maxThrowMs: 900,
  lookbackMs: 400,
  cooldownMs: 800,
  pickupBelowHip: -0.25,
  windupHeight: -0.1,
  windupMaxSpeed: 1.5,
  pickupMemoryMs: 2500,
  // First recordings peaked at 2.2–3.2 torso/s, so 1.5–5 maps them to ~20–50%.
  powerMinSpeed: 1.5,
  powerMaxSpeed: 5.0,
  // Elbow snap: from a held two-handed set overhead, the elbow straightens fast.
  // Lab, Oct 31: recall on the aimed clips 72% → 94%, still no trigger on head
  // scratching or dribbling; one on a two-handed overhead wave.
  snapBent: 150,
  snapStraight: 145,
  snapSetHeight: 0.2,
  snapReleaseHeight: 0.35,
  snapMaxHandsApart: 0.8,
  snapMinRise: 0.03,
  snapMinRate: 80,
  snapWindowMs: 500,
  snapHoldMs: 200,
  // Jump: peak shoulder rise in the last jumpWindowMs. Standing throws rose 0.2–0.8 torso/s, jumping ones 1.4–2.7.
  jumpMinRise: 0.8,
  jumpFullRise: 2.4,
  jumpWindowMs: 500,
  jumpPower: 0.2,
};

/** What the detector needs from the rest of the body each frame (NaN = not visible). */
export interface BodyContext {
  /** The other wrist's height above its shoulder, torso lengths */
  otherHeight: number;
  /** Wrist to wrist, torso lengths */
  handsApart: number;
  /** Shoulder-midpoint velocity, torso lengths/s, image orientation */
  body: Vec2;
  /** Shoulders over hips, torso lengths */
  lean: number;
}

const NO_BODY: BodyContext = { otherHeight: NaN, handsApart: NaN, body: { x: 0, y: 0 }, lean: NaN };

interface Frame {
  t: number;
  elbow: number;
  height: number;
  otherHeight: number;
  handsApart: number;
  speed: number;
  armSpeed: number;
  rise: number;
  vx: number;
  vy: number;
  extension: number;
  lean: number;
}

/** Upper median (sorted[n / 2]), same as the Python port. */
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

interface ThrowInProgress {
  tStart: number;
  extStart: number;
  peakSpeed: number;
  extMax: number;
  heightAtMax: number;
  vxSum: number;
  vySum: number;
  armPeak: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export class ThrowDetector {
  state: DetectorState = "IDLE";
  private throw: ThrowInProgress | null = null;
  private cooldownUntil = 0;
  private lastPickupT = -1e9;
  private hist: { t: number; ext: number }[] = [];
  private speeds: { t: number; speed: number }[] = [];
  /** Visible frames, for the elbow snap and the jump. */
  private recent: Frame[] = [];
  /** The arm being watched; its history means nothing for the other one. */
  private watching: Side | null = null;
  /** False after a timeout until the wrist slows down, so THROW can't re-trigger every frame. */
  private armed = true;

  constructor(public params: ThrowParams = DEFAULT_THROW_PARAMS) {}

  setParams(params: ThrowParams) {
    this.params = params;
  }

  reset() {
    this.state = "IDLE";
    this.throw = null;
    this.cooldownUntil = 0;
    this.lastPickupT = -1e9;
    this.hist = [];
    this.speeds = [];
    this.recent = [];
    this.watching = null;
    this.armed = true;
  }

  /**
   * Convenience: feed a whole KinematicsFrame (uses its chosen hand). A frame where the chosen
   * wrist is out of view counts as the arm being lost, not as a throw by the other arm.
   */
  updateFrame(kin: KinematicsFrame | null, t: number): ThrowEvent | null {
    if (!kin || kin.fallback) return this.update(t, null, kin?.hand ?? "right");
    if (kin.hand !== this.watching) {
      // The shooting hand switched: start its history afresh (cooldown stays).
      this.watching = kin.hand;
      this.throw = null;
      this.hist = [];
      this.speeds = [];
      this.recent = [];
    }
    const other = kin.arms[kin.hand === "left" ? "right" : "left"];
    return this.update(t, kin.arms[kin.hand], kin.hand, {
      otherHeight: other?.height ?? NaN,
      handsApart: kin.handsApart ?? NaN,
      body: kin.body,
      lean: kin.lean ?? NaN,
    });
  }

  update(t: number, arm: ArmKinematics | null, hand: Side, ctx: BodyContext = NO_BODY): ThrowEvent | null {
    const p = this.params;
    if (!arm || !Number.isFinite(arm.speed)) {
      this.throw = null;
      this.state = t < this.cooldownUntil ? "COOLDOWN" : "IDLE";
      return null;
    }

    const { extension: ext, height, speed } = arm;
    const armSpeed = Math.hypot(arm.velocity.x - ctx.body.x, arm.velocity.y - ctx.body.y);
    this.recent.push({
      t,
      elbow: arm.elbowAngle,
      height,
      otherHeight: ctx.otherHeight,
      handsApart: ctx.handsApart,
      speed,
      armSpeed,
      rise: -ctx.body.y,
      vx: arm.velocity.x,
      vy: arm.velocity.y,
      extension: ext,
      lean: ctx.lean,
    });
    const keep = Math.max(p.snapWindowMs + p.snapHoldMs, p.jumpWindowMs);
    while (this.recent.length && t - this.recent[0].t > keep) this.recent.shift();
    this.hist.push({ t, ext });
    while (this.hist.length && t - this.hist[0].t > p.lookbackMs) this.hist.shift();
    if (arm.belowHip > p.pickupBelowHip) this.lastPickupT = t;
    if (speed < p.startSpeed) this.armed = true;

    if (this.state === "COOLDOWN") {
      if (t < this.cooldownUntil) return null;
      this.state = "IDLE";
    }

    // Median speed over the set window, *before* this frame.
    const before = this.speeds.filter((s) => s.t >= t - p.setWindowMs && s.t < t).map((s) => s.speed).sort((a, b) => a - b);
    this.speeds.push({ t, speed });
    while (this.speeds.length && t - this.speeds[0].t > p.setWindowMs) this.speeds.shift();
    const settled = before.length >= 2 && before[Math.floor(before.length / 2)] <= p.maxSetSpeed;

    if (this.state !== "THROW") {
      const prevExt = this.hist.length >= 2 ? this.hist[this.hist.length - 2].ext : ext;
      if (this.armed && settled && speed >= p.startSpeed && height >= p.minHeightStart && ext > prevExt) {
        this.throw = {
          tStart: t,
          extStart: Math.min(...this.hist.map((h) => h.ext)),
          peakSpeed: 0,
          extMax: 0,
          heightAtMax: -9,
          vxSum: 0,
          vySum: 0,
          armPeak: 0,
        };
        this.state = "THROW";
      } else {
        const snap = this.snap(t, hand);
        if (snap) return this.fire(snap);
        if (arm.belowHip > p.pickupBelowHip) this.state = "PICKUP";
        else if (height >= p.windupHeight && speed < p.windupMaxSpeed) this.state = "WINDUP";
        else this.state = "IDLE";
        return null;
      }
    }

    const th = this.throw!;
    if (speed > th.peakSpeed) th.peakSpeed = speed;
    th.armPeak = Math.max(th.armPeak, armSpeed);
    // A snap can complete while the reach-based throw is still deciding (pushes towards the camera
    // often start it, then fail its reach-gained check): take the snap.
    const snap = this.snap(t, hand);
    if (snap) {
      this.throw = null;
      return this.fire(snap);
    }
    if (ext >= th.extMax) {
      th.extMax = ext;
      th.heightAtMax = height;
    }
    th.vxSum += arm.velocity.x;
    th.vySum += arm.velocity.y;

    const elapsed = t - th.tStart;
    if (elapsed > p.maxThrowMs) {
      this.throw = null;
      this.state = "IDLE";
      this.armed = false;
      return null;
    }
    const released =
      elapsed >= p.minThrowMs && (ext < th.extMax - p.extensionDrop || speed < th.peakSpeed * p.speedDropRatio);
    if (!released) return null;

    this.throw = null;
    const angle = th.vxSum || th.vySum ? (Math.atan2(-th.vySum, Math.abs(th.vxSum)) * 180) / Math.PI : 0;
    const valid =
      th.peakSpeed >= p.minPeakSpeed &&
      th.extMax >= p.minExtension &&
      th.extMax - th.extStart >= p.minExtensionGain &&
      angle >= p.minAngle &&
      (th.heightAtMax >= p.minReleaseHeight || (th.heightAtMax >= p.lowReleaseHeight && angle >= p.lowReleaseMinAngle));
    if (!valid) {
      this.state = "IDLE";
      return null;
    }

    const jump = this.jump(t);
    return this.fire({
      t,
      power: this.power(th.armPeak, jump),
      angle,
      arc: clamp01((th.heightAtMax + 0.2) / 1.2),
      hand,
      peakSpeed: th.peakSpeed,
      armSpeed: th.armPeak,
      jump,
      lean: this.lean(),
      extension: th.extMax,
      height: th.heightAtMax,
      pickedUp: t - this.lastPickupT <= p.pickupMemoryMs,
      durationMs: elapsed,
    });
  }

  private fire(ev: ThrowEvent) {
    this.state = "COOLDOWN";
    this.cooldownUntil = ev.t + this.params.cooldownMs;
    return ev;
  }

  // ── Elbow snap and jump ──

  /** 0..1: how fast the shoulders rose in the last jumpWindowMs (a jump into the shot). */
  private jump(t: number) {
    const p = this.params;
    let rise = 0;
    for (const r of this.recent) if (r.t >= t - p.jumpWindowMs && r.rise > rise) rise = r.rise;
    return clamp01((rise - p.jumpMinRise) / (p.jumpFullRise - p.jumpMinRise));
  }

  private lean() {
    const lean = this.recent[this.recent.length - 1].lean;
    return Number.isFinite(lean) ? lean : null;
  }

  private power(armSpeed: number, jump: number) {
    const p = this.params;
    return clamp01((armSpeed - p.powerMinSpeed) / (p.powerMaxSpeed - p.powerMinSpeed) + p.jumpPower * jump);
  }

  /** The current frame ends an elbow snap from a held two-handed set overhead → a throw. */
  private snap(t: number, hand: Side): ThrowEvent | null {
    const p = this.params;
    const k = this.recent[this.recent.length - 1];
    if (!(k.elbow >= p.snapStraight && k.height >= p.snapReleaseHeight)) return null;
    const window = this.recent.slice(0, -1).filter((r) => r.t >= t - p.snapWindowMs && Number.isFinite(r.elbow));
    if (window.length < 2) return null;
    // The set: the most bent frame (the first, if tied)
    const j = window.reduce((m, r) => (r.elbow < m.elbow ? r : m));
    if (j.elbow > p.snapBent || j.height < p.snapSetHeight) return null;
    // Both hands on the ball (NaN, i.e. not visible, fails these)
    if (!(j.otherHeight >= p.snapSetHeight && j.handsApart <= p.snapMaxHandsApart)) return null;
    if (k.height - j.height < p.snapMinRise) return null;
    const seg = this.recent.filter((r) => r.t >= j.t);
    const peak = Math.max(...seg.map((r) => r.speed));
    if (peak < p.minPeakSpeed) return null;
    if (((k.elbow - j.elbow) / Math.max(1, t - j.t)) * 1000 < p.snapMinRate) return null;
    if (median(this.recent.filter((r) => r.t >= j.t - p.snapHoldMs && r.t <= j.t).map((r) => r.speed)) > p.maxSetSpeed) return null;
    let vx = 0;
    let vy = 0;
    for (const r of seg) {
      vx += r.vx;
      vy += r.vy;
    }
    const angle = vx || vy ? (Math.atan2(-vy, Math.abs(vx)) * 180) / Math.PI : 0;
    if (angle < p.minAngle) return null;
    const armPeak = Math.max(...seg.map((r) => r.armSpeed));
    const jump = this.jump(t);
    return {
      t,
      power: this.power(armPeak, jump),
      angle,
      arc: clamp01((k.height + 0.2) / 1.2),
      hand,
      peakSpeed: peak,
      armSpeed: armPeak,
      jump,
      lean: this.lean(),
      extension: k.extension,
      height: k.height,
      pickedUp: t - this.lastPickupT <= p.pickupMemoryMs,
      durationMs: t - j.t,
    };
  }
}
