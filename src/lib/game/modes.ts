import type { DifficultyId } from "./difficulty";

export type ModeId = "daily" | "free" | "timed" | "streak";

export interface Mode {
  id: ModeId;
  name: string;
  blurb: string;
  /** Seconds on the clock (timed and daily modes) */
  seconds?: number;
  /** Game ends on the first miss */
  suddenDeath?: boolean;
}

export const MODES: Record<ModeId, Mode> = {
  daily: { id: "daily", name: "Daily", blurb: "Same challenge for everyone today. A new one every midnight (UTC)." },
  free: { id: "free", name: "Free Play", blurb: "No clock, no pressure. Find your release." },
  timed: { id: "timed", name: "Timed", blurb: "Score as much as you can before the buzzer.", seconds: 60 },
  streak: { id: "streak", name: "Streak", blurb: "Keep making them. One miss and it's over.", suddenDeath: true },
};

export const MODE_ORDER: ModeId[] = ["daily", "free", "timed", "streak"];

/** Shot-clock choices for Timed mode (seconds). */
export const TIMED_OPTIONS = [30, 60, 90, 120] as const;
export type TimedSeconds = (typeof TIMED_OPTIONS)[number];
export const DEFAULT_TIMED_SECONDS: TimedSeconds = 60;

/** Custom shot clock, in whole minutes. */
export const CUSTOM_MINUTES = { min: 1, max: 30 } as const;

export const isPresetDuration = (s: number) => (TIMED_OPTIONS as readonly number[]).includes(s);

/** Keeps any stored/typed duration sane: presets pass through, custom snaps to 1–30 whole minutes. */
export function clampTimedSeconds(s: unknown): number {
  const n = typeof s === "number" && Number.isFinite(s) ? s : DEFAULT_TIMED_SECONDS;
  if (isPresetDuration(n)) return n;
  const minutes = Math.min(CUSTOM_MINUTES.max, Math.max(CUSTOM_MINUTES.min, Math.round(n / 60)));
  return minutes * 60;
}

export function formatDuration(s: number) {
  return s % 60 === 0 && s >= 60 ? `${s / 60} min` : `${s}s`;
}

/** Mode with its effective clock: Timed takes the player's chosen duration, Daily today's. */
export function modeWithClock(id: ModeId, seconds: number): Mode {
  return id === "timed" || id === "daily" ? { ...MODES[id], seconds } : MODES[id];
}

/**
 * Bests key: Timed scores are only comparable at the same duration, Daily ones on the same day
 * (`dailyKey`, e.g. "daily20261030").
 */
export function bestKey(mode: ModeId, difficulty: DifficultyId, timedSeconds?: number, dailyKey?: string) {
  if (mode === "daily") return dailyKey ?? "daily";
  return mode === "timed" ? `timed${timedSeconds ?? DEFAULT_TIMED_SECONDS}:${difficulty}` : `${mode}:${difficulty}`;
}

/** Personal bests per mode + difficulty, kept on this device. */
const BESTS_KEY = "airhoops.bests";

export interface Best {
  points: number;
  makes: number;
  streak: number;
  at: string;
}

type Bests = Partial<Record<string, Best>>;

export function loadBests(): Bests {
  try {
    const bests: Bests = JSON.parse(localStorage.getItem(BESTS_KEY) ?? "{}");
    // Before durations existed, "timed" always meant 60 seconds.
    for (const k of Object.keys(bests)) {
      if (k.startsWith("timed:")) {
        bests[k.replace("timed:", "timed60:")] ??= bests[k];
        delete bests[k];
      }
    }
    return bests;
  } catch {
    return {};
  }
}

/** Saves if it beats the previous best points; returns true for a new record. */
export function recordBest(mode: ModeId, difficulty: DifficultyId, run: Omit<Best, "at">, timedSeconds?: number, dailyKey?: string): boolean {
  const bests = loadBests();
  const key = bestKey(mode, difficulty, timedSeconds, dailyKey);
  const prev = bests[key];
  const better = mode === "streak" ? run.streak > (prev?.streak ?? 0) : run.points > (prev?.points ?? 0);
  if (!better) return false;
  bests[key] = { ...run, at: new Date().toISOString() };
  try {
    localStorage.setItem(BESTS_KEY, JSON.stringify(bests));
  } catch {}
  return true;
}
