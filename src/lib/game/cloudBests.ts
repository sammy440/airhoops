import { api, ApiError, loadGuest } from "@/lib/net/api";
import { loadGhost, saveGhost } from "./ghostRun";
import { beats, loadBests, putBest, type Best } from "./modes";

/**
 * Personal bests and ghosts that follow you to every device.
 *
 * This device keeps its bests (modes.ts) and ghosts (ghostRun.ts) in localStorage, as before; with a
 * player online they're also kept with the account (`/me/bests`). `syncBests` merges the two both ways:
 * the account's better bests (and their ghosts) come down, this device's better ones go up, so bests
 * set before you had an account, or while offline, are uploaded the next time. `pushBest` sends a new
 * best straight after the run.
 */

/** The API's best keys; anything else (e.g. the pre-date "daily") stays on this device. */
const KEY = /^((timed\d{2,4}|streak|free):(rookie|starter|allstar|legend)|daily\d{8})$/;
/** The account lists dailies from the last two days only: older ones have nothing left to race. */
const DAILY_DAYS = 2;

const hasClock = (key: string) => key.startsWith("timed") || key.startsWith("daily");

function current(key: string, now: Date) {
  if (!KEY.test(key)) return false;
  if (!key.startsWith("daily")) return true;
  const oldest = new Date(now.getTime() - DAILY_DAYS * 86_400_000).toISOString().slice(0, 10).replaceAll("-", "");
  return key.slice(5) >= oldest;
}

async function upload(token: string, key: string, best: Best) {
  const ghost = hasClock(key) ? loadGhost(key) : null;
  // A ghost belongs to its best only if it scored the same
  const shots = ghost && ghost.points === best.points ? ghost.shots : undefined;
  const body = { points: best.points, makes: best.makes, streak: best.streak, at: best.at };
  try {
    await api.saveBest(token, key, shots ? { ...body, ghost: shots } : body);
  } catch (e) {
    // A ghost saved by an older version may not add up exactly: keep the best, without it
    if (shots && e instanceof ApiError && e.status === 422) await api.saveBest(token, key, body);
    else throw e;
  }
}

/** Sends a new best (and its ghost) to the account. Never throws: the next `syncBests` retries. */
export async function pushBest(key: string) {
  const guest = loadGuest();
  const best = loadBests()[key];
  if (!guest || !best || !current(key, new Date())) return;
  try {
    await upload(guest.token, key, best);
  } catch {}
}

let inFlight: Promise<boolean> | null = null;

/** Merges this device's bests with the account's. Resolves true if this device's bests changed. */
export function syncBests(now = new Date()): Promise<boolean> {
  inFlight ??= (async () => {
    const guest = loadGuest();
    if (!guest) return false;
    let changed = false;
    try {
      const remote = await api.savedBests(guest.token);
      const local = loadBests();
      for (const key of new Set([...Object.keys(remote), ...Object.keys(local)])) {
        if (!current(key, now)) continue;
        const r = remote[key];
        const l = local[key];
        if (r && beats(key, r, l)) {
          putBest(key, { points: r.points, makes: r.makes, streak: r.streak, at: r.at });
          changed = true;
          if (r.has_ghost && hasClock(key)) {
            const shots = await api.savedGhost(guest.token, key).catch(() => null);
            if (shots?.length) saveGhost(key, { points: r.points, shots });
          }
        } else if (l && beats(key, l, r)) {
          await upload(guest.token, key, l).catch(() => {});
        }
      }
    } catch {
      // Offline, or the session's gone: next time
    }
    return changed;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
