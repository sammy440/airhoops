import { DRIBBLE_ZONE_HEIGHT, type ArmKinematics, type KinematicsFrame, type Side } from "./kinematics";

/**
 * Dribble detector: a hand patting up and down below the chest bounces the ball.
 *
 * Each arm is watched separately (people dribble with either hand). A bounce
 * is one downward stroke that turns back up: the wrist moves down fast
 * enough, far enough, then reverses. Bounces in a steady rhythm make the
 * player "dribbling".
 *
 * People often pat with both hands at once (the first real dribble recording
 * did: both wrists swing ~0.5 torso per beat, in step). That's one bounce, and
 * the ball stays in the hand it was already in rather than hopping to
 * whichever wrist turned a few ms sooner.
 *
 * Dribbling can't trigger a shot: the throw detector needs a still hand (set
 * point) before it starts a throw, and dribbling never pauses. To shoot, raise
 * the ball, hold, push.
 *
 * Units as in kinematics.ts: torso lengths and torso lengths per second.
 */

export interface DribbleParams {
  /** Wrist at least this far below the shoulder (height ≤ this) to dribble. */
  maxHeight: number;
  /** Peak downward wrist speed for a stroke to count. */
  minStrokeSpeed: number;
  /** Vertical travel from the top of the stroke to the bottom. */
  minAmplitude: number;
  /** Bounces closer together than this are the same bounce (jitter, two hands). */
  minIntervalMs: number;
  /** Bounces further apart than this aren't a rhythm. */
  maxIntervalMs: number;
}

export const DEFAULT_DRIBBLE_PARAMS: DribbleParams = {
  maxHeight: DRIBBLE_ZONE_HEIGHT,
  minStrokeSpeed: 1.0,
  minAmplitude: 0.1,
  // 180 let a wobble at the bottom of a pat count twice in the first real recording (pats ~740 ms apart).
  minIntervalMs: 300,
  maxIntervalMs: 1000,
};

export interface BounceEvent {
  t: number;
  hand: Side;
  /** 0..1 from how hard the stroke was. */
  strength: number;
  /** Time since the previous bounce if it was in rhythm, else null. */
  intervalMs: number | null;
  /** Second (or later) bounce in a rhythm. */
  dribbling: boolean;
}

interface Stroke {
  down: boolean;
  top: number;
  bottom: number;
  peakDown: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export class DribbleDetector {
  private strokes: Record<Side, Stroke | null> = { left: null, right: null };
  private lastBounceT = -1e9;
  private streak = 0;
  /** Hand holding the ball after the last bounce. */
  private hand: Side | null = null;
  /** When each hand last finished a real stroke (even one merged into the other hand's bounce). */
  private strokeT: Record<Side, number> = { left: -1e9, right: -1e9 };

  constructor(public params: DribbleParams = DEFAULT_DRIBBLE_PARAMS) {}

  reset() {
    this.strokes = { left: null, right: null };
    this.lastBounceT = -1e9;
    this.streak = 0;
    this.hand = null;
    this.strokeT = { left: -1e9, right: -1e9 };
  }

  /** True while bounces keep coming in rhythm. */
  dribbling(t: number) {
    return this.streak >= 2 && t - this.lastBounceT <= this.params.maxIntervalMs;
  }

  updateFrame(kin: KinematicsFrame | null, t: number): BounceEvent | null {
    let ev: BounceEvent | null = null;
    for (const side of ["left", "right"] as const) ev = this.update(t, kin?.arms[side] ?? null, side) ?? ev;
    return ev;
  }

  update(t: number, arm: ArmKinematics | null, hand: Side): BounceEvent | null {
    const p = this.params;
    if (!arm || !Number.isFinite(arm.speed) || arm.height > p.maxHeight) {
      this.strokes[hand] = null; // out of the dribble zone (or out of view)
      return null;
    }
    const vDown = arm.velocity.y; // image orientation: + = moving down
    const s = (this.strokes[hand] ??= { down: false, top: arm.height, bottom: arm.height, peakDown: 0 });

    if (!s.down) {
      s.top = Math.max(s.top, arm.height);
      if (vDown > p.minStrokeSpeed / 2) {
        s.down = true;
        s.bottom = arm.height;
        s.peakDown = vDown;
      }
      return null;
    }

    s.bottom = Math.min(s.bottom, arm.height);
    s.peakDown = Math.max(s.peakDown, vDown);
    if (vDown > 0) return null; // still going down

    // The hand turned back up: was that a real push?
    const stroke = { ...s };
    this.strokes[hand] = { down: false, top: arm.height, bottom: arm.height, peakDown: 0 };
    if (stroke.peakDown < p.minStrokeSpeed || stroke.top - stroke.bottom < p.minAmplitude) return null;
    this.strokeT[hand] = t;
    const since = t - this.lastBounceT;
    if (since < p.minIntervalMs) return null;

    // Both hands on this beat? Keep the ball where it was.
    const other: Side = hand === "left" ? "right" : "left";
    const otherPatting = (this.strokes[other]?.down ?? false) || t - this.strokeT[other] < p.minIntervalMs;
    const ballHand = otherPatting && this.hand === other ? other : hand;

    const inRhythm = since <= p.maxIntervalMs;
    this.streak = inRhythm ? this.streak + 1 : 1;
    this.lastBounceT = t;
    this.hand = ballHand;
    return {
      t,
      hand: ballHand,
      strength: clamp01((stroke.peakDown - p.minStrokeSpeed) / 3),
      intervalMs: inRhythm ? since : null,
      dribbling: this.streak >= 2,
    };
  }
}
