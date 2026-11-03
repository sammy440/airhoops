import { ON_FIRE } from "./scoring";
import type { ShotResult } from "./physics";

/**
 * Instant replay: which makes are worth watching again, and which part of the flight to show.
 * Kept rare on purpose so it stays a treat, not a toll: every bank shot, every five in a row
 * (catching fire and each five after), and a swish only if the last replay was a few shots ago.
 */

/** Shots that must pass after a replay before a plain swish earns another one. */
export const SWISH_REPLAY_GAP = 4;
/** Playback speed (slow motion). */
export const REPLAY_SPEED = 0.45;
/** Flight time (s) shown before the ball drops through, and after. */
export const REPLAY_LEAD = 0.95;
export const REPLAY_TAIL = 0.45;

export function replayReason(result: ShotResult, streakAfter: number, shotsSinceReplay: number): string | null {
  if (!result.scored) return null;
  if (streakAfter >= ON_FIRE && streakAfter % ON_FIRE === 0) return streakAfter === ON_FIRE ? "ON FIRE" : `${streakAfter} IN A ROW`;
  if (result.bank) return "BANK SHOT";
  if (result.swish && shotsSinceReplay >= SWISH_REPLAY_GAP) return "NOTHING BUT NET";
  return null;
}

/** The slice of a shot's flight (s) a replay plays: up to the drop through the net, then a beat after. */
export function replayWindow(scoredAt: number, duration: number) {
  return { from: Math.max(0, scoredAt - REPLAY_LEAD), to: Math.min(duration, scoredAt + REPLAY_TAIL) };
}
