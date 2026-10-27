import type { ArmKinematics, KinematicsFrame, Side } from "./kinematics";

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
  // Power mapping
  powerMinSpeed: number;
  powerMaxSpeed: number;
}

/** Units: speeds in torso lengths/s, distances in torso lengths. See CHANGELOG.md. */
export const DEFAULT_THROW_PARAMS: ThrowParams = {
  startSpeed: 1.5,
  minHeightStart: -0.35,
  // "Set point": a shot starts from a (nearly) still hand. Waving never pauses.
  setWindowMs: 300,
  maxSetSpeed: 1.2,
  minPeakSpeed: 2.0,
  minExtension: 0.62,
  minExtensionGain: 0.12,
  minReleaseHeight: 0.4,
  // Shots go up; sideways swipes are waves.
  minAngle: 5,
  extensionDrop: 0.04,
  speedDropRatio: 0.45,
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
};

interface ThrowInProgress {
  tStart: number;
  extStart: number;
  peakSpeed: number;
  extMax: number;
  heightAtMax: number;
  vxSum: number;
  vySum: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export class ThrowDetector {
  state: DetectorState = "IDLE";
  private throw: ThrowInProgress | null = null;
  private cooldownUntil = 0;
  private lastPickupT = -1e9;
  private hist: { t: number; ext: number }[] = [];
  private speeds: { t: number; speed: number }[] = [];
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
    this.armed = true;
  }

  /** Convenience: feed a whole KinematicsFrame (uses its chosen hand). */
  updateFrame(kin: KinematicsFrame | null, t: number): ThrowEvent | null {
    return this.update(t, kin?.arms[kin.hand] ?? null, kin?.hand ?? "right");
  }

  update(t: number, arm: ArmKinematics | null, hand: Side): ThrowEvent | null {
    const p = this.params;
    if (!arm || !Number.isFinite(arm.speed)) {
      this.throw = null;
      this.state = t < this.cooldownUntil ? "COOLDOWN" : "IDLE";
      return null;
    }

    const { extension: ext, height, speed } = arm;
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
        };
        this.state = "THROW";
      } else if (arm.belowHip > p.pickupBelowHip) {
        this.state = "PICKUP";
      } else if (height >= p.windupHeight && speed < p.windupMaxSpeed) {
        this.state = "WINDUP";
      } else {
        this.state = "IDLE";
      }
      if (this.state !== "THROW") return null;
    }

    const th = this.throw!;
    if (speed > th.peakSpeed) th.peakSpeed = speed;
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
      th.heightAtMax >= p.minReleaseHeight &&
      angle >= p.minAngle;
    if (!valid) {
      this.state = "IDLE";
      return null;
    }

    this.state = "COOLDOWN";
    this.cooldownUntil = t + p.cooldownMs;
    return {
      t,
      power: clamp01((th.peakSpeed - p.powerMinSpeed) / (p.powerMaxSpeed - p.powerMinSpeed)),
      angle,
      arc: clamp01((th.heightAtMax + 0.2) / 1.2),
      hand,
      peakSpeed: th.peakSpeed,
      extension: th.extMax,
      height: th.heightAtMax,
      pickedUp: t - this.lastPickupT <= p.pickupMemoryMs,
      durationMs: elapsed,
    };
  }
}
