import type { DifficultyId } from "./difficulty";

/**
 * Daily Challenge: one timed run per UTC day that's the same for everyone:
 * same difficulty, same clock, the same wind for shot 1, 2, 3…, and the moving
 * hoop starting from the same spot. Each day has its own leaderboard
 * ("daily20261030").
 *
 * The rules come from a 32-bit integer hash of the day number, so the API can
 * work them out too (app/game/daily.py) and reject a run posted with the wrong
 * difficulty or clock. Keep the two in sync; `daily.test.ts` and the API's
 * test_daily.py pin the same dates.
 */

const DAY_MS = 86_400_000;
const DIFFICULTIES: DifficultyId[] = ["starter", "allstar", "allstar", "legend"];
const SECONDS = [30, 60, 60, 90];

/** 32-bit integer hash (avalanche mix). */
export function mix32(n: number) {
  let x = n >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

export interface DailyRules {
  /** Leaderboard mode key, e.g. "daily20261030" */
  key: string;
  /** UTC date, e.g. "2026-10-30" */
  date: string;
  difficulty: DifficultyId;
  seconds: number;
  seed: number;
}

export function dailyRules(now: Date = new Date()): DailyRules {
  const day = Math.floor(now.getTime() / DAY_MS);
  const date = new Date(day * DAY_MS).toISOString().slice(0, 10);
  const seed = mix32(day);
  return {
    key: `daily${date.replaceAll("-", "")}`,
    date,
    difficulty: DIFFICULTIES[seed % DIFFICULTIES.length],
    seconds: SECONDS[(seed >>> 8) % SECONDS.length],
    seed,
  };
}

/** Same random draw for shot `n` (0-based) for every player today. */
export const dailyRandom = (rules: DailyRules, shot: number) => () => mix32(rules.seed ^ mix32(shot + 1)) / 2 ** 32;

/** Milliseconds until the next challenge (midnight UTC). */
export const msUntilNextDaily = (now: Date = new Date()) => DAY_MS - (now.getTime() % DAY_MS);

export const isDailyKey = (mode: string) => /^daily\d{8}$/.test(mode);

/** Rules for a board key ("daily20261030"), or null if it isn't one. */
export function rulesForKey(key: string): DailyRules | null {
  const m = key.match(/^daily(\d{4})(\d{2})(\d{2})$/);
  return m ? dailyRules(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12))) : null;
}

/** "daily20261030" → "Oct 30" */
export function dailyLabel(key: string) {
  const rules = rulesForKey(key);
  if (!rules) return key;
  return new Date(`${rules.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
