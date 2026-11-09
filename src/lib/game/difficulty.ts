import { DEFAULT_COURT, type Court } from "./physics";

export type DifficultyId = "rookie" | "starter" | "allstar" | "legend";

/**
 * Difficulty is where you shoot from, not a moving hoop: the hoop always stands still, and the
 * harder levels move the shooter back (free-throw line → three-point line → deep three). A longer
 * shot needs more power, so the same wobble in effort misses by more, it's in the air longer for the
 * wind to push, and the rim is a smaller target to aim at (aim tolerance ≈ 1.35° at 4.6 m, 0.92° at
 * 6.75 m, 0.78° at 8 m). Wind, how much your effort wobble counts (`sensitivity`) and the green
 * window tighten with it.
 *
 * Make rates for a steady shooter (power within ±0.05 of ideal, aim within ±1.5° of the wind-corrected
 * line): Rookie 39%, Starter 20%, All-Star 12%, Legend 11%. The old sliding hoops gave 15% and 13%.
 */
export interface Difficulty {
  id: DifficultyId;
  name: string;
  blurb: string;
  /** Release point → rim centre (m) */
  distance: number;
  rimRadius: number;
  /** Max |wind| (m/s²); a new value is drawn for every shot */
  windMax: number;
  /**
   * Calibrated play only: how much a throw that differs from your own average
   * changes the shot. 0.35 forgives ±10% effort; 0.8 punishes it.
   */
  sensitivity: number;
  /** Points multiplier for harder settings */
  scoreMultiplier: number;
  /** Camera play: seconds per 3 s loop that the rim is green (a throw then swishes; see green.ts) */
  greenWindow: number;
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  rookie: {
    id: "rookie",
    name: "Rookie",
    blurb: "Close in, oversized rim, forgiving",
    distance: 3.6,
    rimRadius: 0.27,
    windMax: 0,
    sensitivity: 0.35,
    scoreMultiplier: 1,
    greenWindow: 1.2,
  },
  starter: {
    id: "starter",
    name: "Starter",
    blurb: "Free-throw line, regulation rim",
    distance: 4.6,
    rimRadius: 0.2286,
    windMax: 0,
    sensitivity: 0.5,
    scoreMultiplier: 1,
    greenWindow: 1.0,
  },
  allstar: {
    id: "allstar",
    name: "All-Star",
    blurb: "Three-point line, light wind",
    // On the arc (FIBA three-point line, 6.75 m): the court's markings put your feet right on it
    distance: 6.75,
    rimRadius: 0.2286,
    windMax: 0.6,
    sensitivity: 0.6,
    scoreMultiplier: 1.5,
    greenWindow: 0.8,
  },
  legend: {
    id: "legend",
    name: "Legend",
    blurb: "Deep three, gusty",
    // A step and a half behind the arc: deep, but still on the painted floor (it reaches 9.2 m back)
    distance: 8,
    rimRadius: 0.2286,
    windMax: 1.2,
    sensitivity: 0.75,
    scoreMultiplier: 2,
    greenWindow: 0.6,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ["rookie", "starter", "allstar", "legend"];

export function courtFor(d: Difficulty): Court {
  return { ...DEFAULT_COURT, hoopDistance: d.distance, rimRadius: d.rimRadius, hoopMotion: null };
}

/** Wind for the next shot, in 0.1 m/s² steps so the HUD shows exactly what the physics uses. */
export function rollWind(d: Difficulty, random: () => number = Math.random) {
  if (!d.windMax) return 0;
  return Math.round((random() * 2 - 1) * d.windMax * 10) / 10;
}
