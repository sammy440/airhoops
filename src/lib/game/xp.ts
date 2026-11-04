/**
 * XP and levels. Mirrors airhoops-backend/app/game/xp.py line for line (xp.test.ts and
 * the backend's tests/test_xp.py check the same examples). XP comes from what you did:
 * the server is sent play stats and works the XP out itself.
 */

export const XP = {
  shot: 1, // every shot counts a little, so a cold day still moves the bar
  make: 10,
  swish: 5, // on top of the make
  bank: 5,
  streak: 5, // per make in your best streak beyond the second
  run: 25, // finishing a timed, streak or daily run
  daily: 50, // first finished daily challenge of the day
  match: 20, // finishing a multiplayer game
  win: 50,
} as const;

export const MAX_LEVEL = 50;

export interface XpStats {
  shots: number;
  makes: number;
  swishes: number;
  banks: number;
  bestStreak: number;
  runs: number;
  dailies: number;
  matches: number;
  wins: number;
}

export const NO_STATS: XpStats = { shots: 0, makes: 0, swishes: 0, banks: 0, bestStreak: 0, runs: 0, dailies: 0, matches: 0, wins: 0 };

export function xpFor(s: Partial<XpStats>): number {
  const v = { ...NO_STATS, ...s };
  return (
    v.shots * XP.shot +
    v.makes * XP.make +
    v.swishes * XP.swish +
    v.banks * XP.bank +
    Math.max(0, v.bestStreak - 2) * XP.streak +
    v.runs * XP.run +
    v.dailies * XP.daily +
    v.matches * XP.match +
    v.wins * XP.win
  );
}

/** Total XP at which `level` starts: 100 for level 2, and each level after needs 50 more than the last. */
export function xpToReach(level: number): number {
  const n = Math.max(1, Math.min(level, MAX_LEVEL)) - 1;
  return 100 * n + 25 * n * (n - 1);
}

export function levelFor(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpToReach(level + 1)) level++;
  return level;
}

/** Where you are within your level, for a progress bar. */
export function levelProgress(xp: number) {
  const level = levelFor(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, needed: 0, fraction: 1 };
  const start = xpToReach(level);
  const needed = xpToReach(level + 1) - start;
  return { level, into: xp - start, needed, fraction: (xp - start) / needed };
}
