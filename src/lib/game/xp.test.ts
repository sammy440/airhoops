import { beforeEach, describe, expect, it } from "vitest";
import { unlockedBetween, usableLoadout } from "./cosmetics";
import { loadProgress, recordPlay, shownXp, toGain } from "./progress";
import { levelFor, levelProgress, MAX_LEVEL, xpFor, xpToReach } from "./xp";

// Same examples as airhoops-backend/tests/test_xp.py
describe("xp rules", () => {
  it("counts play", () => {
    expect(xpFor({ shots: 20, makes: 12, swishes: 3, banks: 1, bestStreak: 5, runs: 1 })).toBe(20 + 120 + 15 + 5 + 15 + 25);
    expect(xpFor({ matches: 1, wins: 1 })).toBe(70);
    expect(xpFor({ bestStreak: 2 })).toBe(0);
  });

  it("levels up on a gently steepening curve", () => {
    expect([1, 2, 3, 4, 5, 10].map(xpToReach)).toEqual([0, 100, 250, 450, 700, 2700]);
    expect([0, 99, 100, 249, 250].map(levelFor)).toEqual([1, 1, 2, 2, 3]);
    expect(levelFor(1e9)).toBe(MAX_LEVEL);
    expect(levelProgress(175)).toMatchObject({ level: 2, into: 75, needed: 150, fraction: 0.5 });
  });
});

describe("unlocks", () => {
  it("lists what a level-up unlocks", () => {
    expect(unlockedBetween(2, 4)).toEqual(["Retro ball", "Blue flame trail"]);
    expect(unlockedBetween(4, 5)).toEqual([]);
  });

  it("falls back to the default for anything still locked", () => {
    expect(usableLoadout({ ball: "gold", trail: "blue" }, 5)).toEqual({ ball: "classic", trail: "blue" });
  });
});

describe("progress on this device", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;
  });

  it("adds play up, with the daily bonus once and the streak bonus by how far a streak gets", () => {
    recordPlay({ shots: 1, makes: 1, swishes: 1, bestStreak: 1 });
    recordPlay({ shots: 1, makes: 1, bestStreak: 2 });
    const r = recordPlay({ shots: 1, makes: 1, bestStreak: 3 });
    expect(r).toEqual({ before: 27, after: 27 + 11 + 5 });
    recordPlay({ runs: 1, daily: "daily20261104" });
    recordPlay({ runs: 1, daily: "daily20261104" });
    const p = loadProgress();
    expect(p.pending).toMatchObject({ shots: 3, makes: 3, swishes: 1, bestStreak: 3, runs: 2, daily: "daily20261104" });
    expect(shownXp(p)).toBe(43 + 25 + 50 + 25);
  });

  it("sends a big backlog scaled into one batch the API accepts", () => {
    const g = toGain({ shots: 5000, makes: 2500, swishes: 600, banks: 100, bestStreak: 40, runs: 80, daily: null, misses: { short: 2000, rim: 500 } });
    expect(g).toEqual({ shots: 2000, makes: 1000, swishes: 240, banks: 40, best_streak: 40, runs: 50, daily: null, misses: { short: 800, rim: 200 } });
  });

  it("counts misses by kind and never sends more than the missed shots", () => {
    recordPlay({ shots: 1, misses: { short: 1 } });
    recordPlay({ shots: 1, misses: { short: 1 } });
    recordPlay({ shots: 1, makes: 1 });
    recordPlay({ shots: 1, misses: { rim: 1 } });
    expect(loadProgress().pending.misses).toEqual({ short: 2, rim: 1 });
    const g = toGain({ shots: 3, makes: 1, swishes: 0, banks: 0, bestStreak: 1, runs: 0, daily: null, misses: { short: 2, rim: 1 } });
    expect(Object.values(g.misses!).reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("reads progress saved before misses were counted", () => {
    localStorage.setItem("airhoops.progress", JSON.stringify({ local: 5, pending: { shots: 2, makes: 1, swishes: 0, banks: 0, bestStreak: 1, runs: 0, daily: null } }));
    expect(loadProgress().pending.misses).toEqual({});
  });
});
