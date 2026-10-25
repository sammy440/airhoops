import { DEFAULT_COURT, type Court, type HoopMotion } from "./physics";

export type DifficultyId = "rookie" | "starter" | "allstar" | "legend";

export interface Difficulty {
  id: DifficultyId;
  name: string;
  blurb: string;
  /** Release point → rim centre (m) */
  distance: number;
  rimRadius: number;
  hoopMotion: HoopMotion | null;
  /** Max |wind| (m/s²); a new value is drawn for every shot */
  windMax: number;
  /**
   * Calibrated play only: how much a throw that differs from your own average
   * changes the shot. 0.35 forgives ±10% effort; 0.8 punishes it.
   */
  sensitivity: number;
  /** Points multiplier for harder settings */
  scoreMultiplier: number;
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  rookie: {
    id: "rookie",
    name: "Rookie",
    blurb: "Close, oversized rim, forgiving",
    distance: 3.6,
    rimRadius: 0.27,
    hoopMotion: null,
    windMax: 0,
    sensitivity: 0.35,
    scoreMultiplier: 1,
  },
  starter: {
    id: "starter",
    name: "Starter",
    blurb: "Free-throw line, regulation rim",
    distance: 4.6,
    rimRadius: 0.2286,
    hoopMotion: null,
    windMax: 0,
    sensitivity: 0.5,
    scoreMultiplier: 1,
  },
  allstar: {
    id: "allstar",
    name: "All-Star",
    blurb: "Longer shot, sliding hoop, light wind",
    distance: 5.8,
    rimRadius: 0.2286,
    hoopMotion: { amplitude: 0.45, frequency: 0.22 },
    windMax: 0.6,
    sensitivity: 0.6,
    scoreMultiplier: 1.5,
  },
  legend: {
    id: "legend",
    name: "Legend",
    blurb: "From downtown, fast hoop, gusty",
    distance: 6.75,
    rimRadius: 0.2286,
    hoopMotion: { amplitude: 0.7, frequency: 0.3 },
    windMax: 1.2,
    sensitivity: 0.75,
    scoreMultiplier: 2,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ["rookie", "starter", "allstar", "legend"];

export function courtFor(d: Difficulty): Court {
  return { ...DEFAULT_COURT, hoopDistance: d.distance, rimRadius: d.rimRadius, hoopMotion: d.hoopMotion };
}

/** Wind for the next shot, in 0.1 m/s² steps so the HUD shows exactly what the physics uses. */
export function rollWind(d: Difficulty, random: () => number = Math.random) {
  if (!d.windMax) return 0;
  return Math.round((random() * 2 - 1) * d.windMax * 10) / 10;
}
