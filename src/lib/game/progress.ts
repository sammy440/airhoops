import { api, loadGuest, type XpGain } from "@/lib/net/api";
import { DEFAULT_LOADOUT, type Loadout } from "./cosmetics";
import { XP, xpFor } from "./xp";

/**
 * Your XP on this device, kept in step with your account.
 *
 * Solo play is recorded here as it happens (`recordPlay`) and sent to the server as stats
 * (`syncProgress`), which works out the XP itself. Multiplayer XP is awarded by the server at
 * match end (`awardFromServer`). Without an account, XP simply stays on this device.
 *
 * Shown XP is the larger of what this device has earned and the account's total plus anything
 * not sent yet, so progress never visibly drops (e.g. play from before you had an account).
 */

const KEY = "airhoops.progress";
const CHANGED = "airhoops:progress";

/** Solo play not yet sent. */
export interface PendingPlay {
  shots: number;
  makes: number;
  swishes: number;
  banks: number;
  bestStreak: number;
  runs: number;
  /** A finished daily challenge, e.g. "daily20261104" */
  daily: string | null;
}

export interface Progress {
  /** XP earned on this device (an estimate: the server has the final say on solo XP) */
  local: number;
  /** The account's total, as last heard from the server */
  server: number | null;
  /** Whose total `server` is */
  account: string | null;
  pending: PendingPlay;
  /** The daily that last earned its bonus here */
  lastDaily: string | null;
  loadout: Loadout;
}

const NO_PLAY: PendingPlay = { shots: 0, makes: 0, swishes: 0, banks: 0, bestStreak: 0, runs: 0, daily: null };
const FRESH: Progress = { local: 0, server: null, account: null, pending: NO_PLAY, lastDaily: null, loadout: DEFAULT_LOADOUT };

export function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return p ? { ...FRESH, ...p, pending: { ...NO_PLAY, ...p.pending }, loadout: { ...DEFAULT_LOADOUT, ...p.loadout } } : FRESH;
  } catch {
    return FRESH;
  }
}

function save(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED));
}

/** Listen for changes (this tab or another). Returns an unsubscribe. */
export function onProgress(fn: () => void) {
  const storage = (e: StorageEvent) => e.key === KEY && fn();
  window.addEventListener(CHANGED, fn);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(CHANGED, fn);
    window.removeEventListener("storage", storage);
  };
}

const playXp = (p: PendingPlay, withDaily: boolean) =>
  xpFor({ shots: p.shots, makes: p.makes, swishes: p.swishes, banks: p.banks, bestStreak: p.bestStreak, runs: p.runs, dailies: withDaily && p.daily ? 1 : 0 });

export function shownXp(p: Progress) {
  return Math.max(p.local, (p.server ?? 0) + playXp(p.pending, p.pending.daily !== null));
}

/**
 * Solo play happened (a shot, or a finished run). Returns XP before and after, for level-ups.
 * `bestStreak` is the run's best streak so far; a batch keeps the highest.
 */
export function recordPlay(play: Partial<PendingPlay>) {
  const p = loadProgress();
  const before = shownXp(p);
  const add = { ...NO_PLAY, ...play };
  const daily = add.daily && add.daily !== p.lastDaily ? add.daily : null;
  // XP for this bit of play: the streak bonus only for how far it beats the batch's best so far
  const streakGain = Math.max(0, add.bestStreak - 2) - Math.max(0, p.pending.bestStreak - 2);
  const gained = xpFor({ shots: add.shots, makes: add.makes, swishes: add.swishes, banks: add.banks, runs: add.runs, dailies: daily ? 1 : 0 }) + Math.max(0, streakGain) * XP.streak;
  const next: Progress = {
    ...p,
    local: p.local + gained,
    lastDaily: daily ?? p.lastDaily,
    pending: {
      shots: p.pending.shots + add.shots,
      makes: p.pending.makes + add.makes,
      swishes: p.pending.swishes + add.swishes,
      banks: p.pending.banks + add.banks,
      bestStreak: Math.max(p.pending.bestStreak, add.bestStreak),
      runs: p.pending.runs + add.runs,
      daily: daily ?? p.pending.daily,
    },
  };
  save(next);
  return { before, after: shownXp(next) };
}

/** Multiplayer XP, awarded and sent by the server at match end. */
export function awardFromServer(gained: number, total: number) {
  const p = loadProgress();
  const before = shownXp(p);
  const next = { ...p, local: p.local + gained, server: total, account: loadGuest()?.user.id ?? p.account };
  save(next);
  return { before, after: shownXp(next) };
}

export function setLoadout(loadout: Loadout) {
  save({ ...loadProgress(), loadout });
}

/** The API takes at most 2,000 shots a batch: scale a bigger backlog down, keeping it consistent. */
export function toGain(p: PendingPlay): XpGain {
  const k = p.shots > 2000 ? 2000 / p.shots : 1;
  const scale = (n: number) => Math.floor(n * k);
  const shots = scale(p.shots);
  const makes = Math.min(shots, scale(p.makes));
  const swishes = Math.min(makes, scale(p.swishes));
  const banks = Math.min(makes - swishes, scale(p.banks));
  return { shots, makes, swishes, banks, best_streak: Math.min(makes, p.bestStreak), runs: Math.min(50, p.runs), daily: p.daily };
}

const isEmpty = (p: PendingPlay) => !p.shots && !p.runs && !p.daily;

let inFlight: Promise<Progress> | null = null;

/** Sends unsent play and refreshes the account total. Safe to call often; offline is fine. */
export function syncProgress(): Promise<Progress> {
  inFlight ??= (async () => {
    const guest = loadGuest();
    let p = loadProgress();
    if (!guest) return p;
    if (p.account !== guest.user.id) {
      // A different account on this device: its own total
      p = { ...p, account: guest.user.id, server: null };
      save(p);
    }
    try {
      if (!isEmpty(p.pending)) {
        const sent = p.pending;
        const res = await api.gainXp(guest.token, toGain(sent));
        // Anything recorded while the request was out stays pending
        const now = loadProgress();
        const left: PendingPlay = {
          shots: Math.max(0, now.pending.shots - sent.shots),
          makes: Math.max(0, now.pending.makes - sent.makes),
          swishes: Math.max(0, now.pending.swishes - sent.swishes),
          banks: Math.max(0, now.pending.banks - sent.banks),
          bestStreak: now.pending.bestStreak > sent.bestStreak ? now.pending.bestStreak : 0,
          runs: Math.max(0, now.pending.runs - sent.runs),
          daily: now.pending.daily !== sent.daily ? now.pending.daily : null,
        };
        p = { ...now, server: res.xp, pending: left };
      } else {
        const me = await api.me(guest.token);
        p = { ...loadProgress(), server: me.xp ?? 0 };
      }
      save(p);
    } catch {
      // Offline, or the session's gone: try again next time
    }
    return p;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
