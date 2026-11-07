import { api, ApiError, loadGuest } from "@/lib/net/api";
import { COURT_THEME_ORDER, type CourtThemeId } from "./courts";

/**
 * Achievements: moments worth marking. The server decides (airhoops-backend app/game/achievements.py,
 * same ids in the same order: both test suites pin them). Most are counted from your shooting history
 * or refereed at the end of a match; three solo moments only the browser sees are claimed from here.
 * They need a player online; claims made before you have one wait on this device and go up later.
 */

export type AchievementId =
  | "first_bucket"
  | "swish_10"
  | "swish_100"
  | "bank_10"
  | "shots_1000"
  | "shots_10000"
  | "streak_5"
  | "streak_10"
  | "streak_20"
  | "daily_1"
  | "daily_7"
  | "first_win"
  | "horse_clean"
  | "shootout_perfect"
  | "series_win"
  | "buzzer_beater"
  | "green_light"
  | "world_tour";

export type AchievementGroup = "Shooting" | "Streaks" | "Daily" | "Multiplayer" | "Moments";

export interface Achievement {
  id: AchievementId;
  name: string;
  /** How to earn it */
  how: string;
  icon: string;
  group: AchievementGroup;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_bucket", name: "First bucket", how: "Make your first shot", icon: "🏀", group: "Shooting" },
  { id: "swish_10", name: "Nothing but net", how: "10 swishes", icon: "🎯", group: "Shooting" },
  { id: "swish_100", name: "Net worth", how: "100 swishes", icon: "💰", group: "Shooting" },
  { id: "bank_10", name: "Glass cleaner", how: "10 bank shots", icon: "🪟", group: "Shooting" },
  { id: "shots_1000", name: "Gym rat", how: "Take 1,000 shots", icon: "🐀", group: "Shooting" },
  { id: "shots_10000", name: "Ten thousand", how: "Take 10,000 shots", icon: "🏛️", group: "Shooting" },
  { id: "streak_5", name: "Heating up", how: "Make 5 in a row", icon: "🔥", group: "Streaks" },
  { id: "streak_10", name: "On fire", how: "Make 10 in a row", icon: "☄️", group: "Streaks" },
  { id: "streak_20", name: "Unconscious", how: "Make 20 in a row", icon: "🌋", group: "Streaks" },
  { id: "daily_1", name: "Daily driver", how: "Finish a Daily challenge", icon: "📅", group: "Daily" },
  { id: "daily_7", name: "Seven straight", how: "Finish the Daily 7 days in a row", icon: "🗓️", group: "Daily" },
  { id: "first_win", name: "Winner", how: "Win a multiplayer match", icon: "🏆", group: "Multiplayer" },
  { id: "horse_clean", name: "Spotless", how: "Win H-O-R-S-E without a letter", icon: "🐎", group: "Multiplayer" },
  { id: "shootout_perfect", name: "Perfect five", how: "Win a shootout without missing", icon: "🖐️", group: "Multiplayer" },
  { id: "series_win", name: "Series champ", how: "Win a best-of-3 or best-of-5 series", icon: "👑", group: "Multiplayer" },
  { id: "buzzer_beater", name: "Buzzer beater", how: "Make a shot released in the last second of a timed run", icon: "⏱️", group: "Moments" },
  { id: "green_light", name: "Green light", how: "Swish one off the green rim", icon: "🟢", group: "Moments" },
  { id: "world_tour", name: "World tour", how: "Finish a run on every court", icon: "🌍", group: "Moments" },
];

export const achievement = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);

/** A shot released this close to the buzzer (s) is a buzzer beater if it goes in. */
export const BUZZER_S = 1;

/** Solo moments in a resolved shot, to claim. `at`: run time at release; `seconds`: the run's clock, if any. */
export function shotMoments(shot: { scored: boolean; swish: boolean; green?: boolean; at: number; seconds?: number }): AchievementId[] {
  const out: AchievementId[] = [];
  if (shot.scored && shot.seconds && shot.at >= shot.seconds - BUZZER_S) out.push("buzzer_beater");
  if (shot.scored && shot.swish && shot.green) out.push("green_light");
  return out;
}

/* ── This device ── */

const COURTS_KEY = "airhoops.courts";
const CLAIMS_KEY = "airhoops.claims";
const SEEN_KEY = "airhoops.achievements";

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** A run was finished on this court. Returns true once every court has had one. */
export function courtFinished(court: CourtThemeId): boolean {
  const done = new Set(read<string[]>(COURTS_KEY, []));
  done.add(court);
  write(COURTS_KEY, [...done]);
  return COURT_THEME_ORDER.every((c) => done.has(c));
}

/** Claims a solo moment. Without a player online (or offline) it waits here for `syncAchievements`. */
export async function claim(ids: AchievementId[]) {
  if (!ids.length) return;
  const pending = new Set(read<AchievementId[]>(CLAIMS_KEY, []));
  for (const id of ids) pending.add(id);
  write(CLAIMS_KEY, [...pending]);
  await sendClaims();
}

async function sendClaims() {
  const guest = loadGuest();
  if (!guest) return;
  for (const id of read<AchievementId[]>(CLAIMS_KEY, [])) {
    try {
      await api.claimAchievement(guest.token, id);
    } catch (e) {
      // Refused (unknown id, say) is final; anything else (offline) waits for next time
      if (!(e instanceof ApiError && e.status === 422)) continue;
    }
    write(CLAIMS_KEY, read<AchievementId[]>(CLAIMS_KEY, []).filter((x) => x !== id));
  }
}

let inFlight: Promise<Achievement[]> | null = null;

/**
 * Sends waiting claims, then reads what the account has earned. Resolves with the ones this device
 * hasn't announced yet (none on a device's first look, so an old account isn't re-announced).
 */
export function syncAchievements(): Promise<Achievement[]> {
  inFlight ??= (async () => {
    const guest = loadGuest();
    if (!guest) return [];
    try {
      await sendClaims();
      const earned = (await api.myAchievements(guest.token)).map((a) => a.id);
      const seen = read<Record<string, string[]>>(SEEN_KEY, {});
      const before = seen[guest.user.id];
      seen[guest.user.id] = earned;
      write(SEEN_KEY, seen);
      if (!before) return [];
      return earned.filter((id) => !before.includes(id)).flatMap((id) => achievement(id) ?? []);
    } catch {
      return [];
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Marks achievements as announced (e.g. ones the match just told us about). */
export function markSeen(ids: string[]) {
  const guest = loadGuest();
  if (!guest) return;
  const seen = read<Record<string, string[]>>(SEEN_KEY, {});
  seen[guest.user.id] = [...new Set([...(seen[guest.user.id] ?? []), ...ids])];
  write(SEEN_KEY, seen);
}
