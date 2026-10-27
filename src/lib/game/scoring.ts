import type { ShotResult } from "./physics";

export const BASE_POINTS = 2;
export const SWISH_BONUS = 1;

/** Multiplier by how many makes in a row came *before* this shot. */
export const STREAK_TIERS = [
  { from: 0, multiplier: 1 },
  { from: 3, multiplier: 1.5 },
  { from: 5, multiplier: 2 },
  { from: 10, multiplier: 3 },
] as const;

export function streakMultiplier(streakBefore: number) {
  let m = 1;
  for (const tier of STREAK_TIERS) if (streakBefore >= tier.from) m = tier.multiplier;
  return m;
}

export interface ShotScore {
  points: number;
  base: number;
  swishBonus: number;
  multiplier: number;
  /** Streak after this shot */
  streak: number;
}

export function scoreShot(result: ShotResult, streakBefore: number, difficultyMultiplier = 1): ShotScore {
  if (!result.scored) return { points: 0, base: 0, swishBonus: 0, multiplier: 1, streak: 0 };
  const swishBonus = result.swish ? SWISH_BONUS : 0;
  const multiplier = streakMultiplier(streakBefore) * difficultyMultiplier;
  return {
    points: Math.round((BASE_POINTS + swishBonus) * multiplier),
    base: BASE_POINTS,
    swishBonus,
    multiplier,
    streak: streakBefore + 1,
  };
}

export interface Tally {
  points: number;
  makes: number;
  shots: number;
  swishes: number;
  streak: number;
  best: number;
}

export const EMPTY_TALLY: Tally = { points: 0, makes: 0, shots: 0, swishes: 0, streak: 0, best: 0 };

export function addShot(t: Tally, result: ShotResult, difficultyMultiplier = 1): { tally: Tally; score: ShotScore } {
  const score = scoreShot(result, t.streak, difficultyMultiplier);
  return {
    score,
    tally: {
      points: t.points + score.points,
      makes: t.makes + (result.scored ? 1 : 0),
      shots: t.shots + 1,
      swishes: t.swishes + (result.swish ? 1 : 0),
      streak: score.streak,
      best: Math.max(t.best, score.streak),
    },
  };
}
