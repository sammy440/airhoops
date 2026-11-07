/**
 * Auto-highlights: with clips on, the moments worth keeping are saved as they happen (no pause, no
 * button), and the end screen offers them. Only what's already being recorded, on this device.
 */

/** Wait this long after the make (s) before saving, so the clip has the swish and the celebration. */
export const HIGHLIGHT_DELAY_S = 1.5;
/** At most this many a run (each is an ~8 s MP4 held in memory). */
export const MAX_HIGHLIGHTS = 5;
/** Two highlights this close (s, run time) would be the same clip: keep the first. */
export const HIGHLIGHT_GAP_S = 3;
const STREAK_STEPS = [5, 10, 15, 20, 30, 40, 50];

export interface HighlightShot {
  scored: boolean;
  swish: boolean;
  green?: boolean;
  /** Released in clutch time */
  clutch?: boolean;
  /** Run time at release (s), and the run's clock if it has one */
  at: number;
  seconds?: number;
  /** The streak including this shot */
  streak: number;
}

/** What makes this shot a highlight (best reason first), or null. */
export function highlightFor(s: HighlightShot): string | null {
  if (!s.scored) return null;
  if (s.seconds && s.at >= s.seconds - 1) return "Buzzer beater";
  if (s.green && s.swish) return "Green swish";
  if (STREAK_STEPS.includes(s.streak)) return `${s.streak} in a row`;
  if (s.clutch) return s.swish ? "Clutch swish" : "Clutch bucket";
  return null;
}

/** Whether there's room for another highlight at run time `at`, given the ones kept so far. */
export function roomForHighlight(kept: { at: number }[], at: number): boolean {
  return kept.length < MAX_HIGHLIGHTS && kept.every((h) => Math.abs(at - h.at) >= HIGHLIGHT_GAP_S);
}
