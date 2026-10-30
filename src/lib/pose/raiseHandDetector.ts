import type { ArmKinematics, KinematicsFrame } from "./kinematics";

/**
 * Raise-hand detector: hold a hand up high and still to press the button on screen,
 * so players never have to walk back to the keyboard between games.
 *
 * "Up high" means the wrist well above the head (arm nearly straight up), not just
 * above the shoulder: that's where a throw's release, a wave or a head scratch sits.
 * "Still" rules out waving. The hold has to last a second, longer than any
 * follow-through.
 *
 * After firing, and after reset() (call it whenever the screen changes), the
 * detector is disarmed until both hands come down below the shoulders. So a hand
 * still up from the last shot can't press the next screen's button by itself.
 *
 * Units as in kinematics.ts: torso lengths and torso lengths per second.
 */

export interface RaiseHandParams {
  /** Wrist at least this far above its shoulder to count as raised. */
  minHeight: number;
  /** Wrist slower than this to count as held (a wave is several torso/s). */
  maxSpeed: number;
  /**
   * How long to hold. In the recordings (throws, waves, head scratches) a hand
   * never stays this high and still for more than 360 ms.
   */
  holdMs: number;
  /** Both wrists below this (height vs shoulder) re-arms the detector. */
  lowerHeight: number;
  /** A raised hand may drop out of view or twitch for this long without losing the hold. */
  graceMs: number;
}

export const DEFAULT_RAISE_HAND_PARAMS: RaiseHandParams = {
  minHeight: 0.7,
  maxSpeed: 1.2,
  holdMs: 1000,
  lowerHeight: 0,
  graceMs: 150,
};

export type RaisedHands = "one" | "both";

export interface RaiseHandState {
  /** Hands held up right now, or null. */
  hands: RaisedHands | null;
  /** 0..1 towards firing (0 while disarmed). */
  progress: number;
}

export interface RaiseHandEvent {
  t: number;
  /** Both hands were up for the whole hold. */
  hands: RaisedHands;
}

const raised = (arm: ArmKinematics | null, p: RaiseHandParams) =>
  !!arm && Number.isFinite(arm.speed) && arm.height >= p.minHeight && arm.speed <= p.maxSpeed;
const lowered = (arm: ArmKinematics | null, p: RaiseHandParams) => !arm || arm.height < p.lowerHeight;

export class RaiseHandDetector {
  private armed = false;
  private since: number | null = null;
  private lastHeld = -1e9;
  /** Both hands stayed up since the hold began. */
  private both = false;
  private _state: RaiseHandState = { hands: null, progress: 0 };

  constructor(public params: RaiseHandParams = DEFAULT_RAISE_HAND_PARAMS) {}

  get state(): RaiseHandState {
    return this._state;
  }

  /** Drop any hold and wait for the hands to come down before listening again. */
  reset() {
    this.armed = false;
    this.since = null;
    this.both = false;
    this._state = { hands: null, progress: 0 };
  }

  updateFrame(kin: KinematicsFrame | null, t: number): RaiseHandEvent | null {
    const p = this.params;
    const left = kin?.arms.left ?? null;
    const right = kin?.arms.right ?? null;

    if (!this.armed) {
      if (kin && lowered(left, p) && lowered(right, p)) this.armed = true;
      this._state = { hands: null, progress: 0 };
      return null;
    }

    const up = [raised(left, p), raised(right, p)].filter(Boolean).length;
    if (up === 0) {
      if (this.since !== null && t - this.lastHeld > p.graceMs) this.since = null;
      this._state = { hands: null, progress: this.since === null ? 0 : this._state.progress };
      return null;
    }

    this.lastHeld = t;
    // The second hand joining starts the hold over, so "both" always means both, all the way through.
    if (this.since === null || (up === 2 && !this.both)) {
      this.since = t;
      this.both = up === 2;
    } else if (up < 2) {
      this.both = false;
    }
    const progress = Math.min(1, (t - this.since) / p.holdMs);
    const hands: RaisedHands = up === 2 ? "both" : "one";
    this._state = { hands, progress };
    if (progress < 1) return null;

    const ev = { t, hands: this.both ? "both" : "one" } as const;
    this.reset();
    return ev;
  }
}
