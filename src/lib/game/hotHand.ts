import type { BounceEvent } from "@/lib/pose/dribbleDetector";

/**
 * Hot hand (solo): dribble in rhythm before a shot and your next make scores
 * one streak tier higher (see hotMultiplier in scoring.ts).
 *
 * HOT_BOUNCES bounces in a row heats the hand up; it stays hot until the next
 * shot, or cools off HOT_WINDOW_MS after the last bounce, so you have to
 * dribble *into* the shot (raise, set, push takes a second or two).
 */

export const HOT_BOUNCES = 4;
export const HOT_WINDOW_MS = 4000;

export class HotHand {
  private count = 0;
  private lastT = -1e9;

  reset() {
    this.count = 0;
    this.lastT = -1e9;
  }

  /** Feed every bounce. A bounce out of rhythm starts the count over. */
  bounce(ev: BounceEvent) {
    if (ev.t - this.lastT > HOT_WINDOW_MS) this.count = 0;
    this.count = ev.intervalMs === null ? 1 : Math.min(HOT_BOUNCES, this.count + 1);
    this.lastT = ev.t;
  }

  /** Bounces towards heating up, 0..HOT_BOUNCES (0 once it has cooled off). */
  bounces(t: number) {
    return t - this.lastT > HOT_WINDOW_MS ? 0 : this.count;
  }

  isHot(t: number) {
    return this.bounces(t) >= HOT_BOUNCES;
  }

  /** Takes the shot: returns whether it was hot, and starts over either way. */
  shoot(t: number) {
    const hot = this.isHot(t);
    this.reset();
    return hot;
  }
}
