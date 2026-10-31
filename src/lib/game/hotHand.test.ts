import { describe, expect, it } from "vitest";
import type { BounceEvent } from "@/lib/pose/dribbleDetector";
import { HOT_BOUNCES, HOT_WINDOW_MS, HotHand } from "./hotHand";
import { addShot, EMPTY_TALLY, hotMultiplier, scoreShot, STREAK_TIERS } from "./scoring";

const bounce = (t: number, intervalMs: number | null = 600): BounceEvent => ({ t, hand: "right", strength: 0.5, intervalMs, dribbling: intervalMs !== null });

/** `n` bounces 600 ms apart starting at t0 (the first one starts a rhythm). */
function dribble(hot: HotHand, n: number, t0 = 0) {
  for (let i = 0; i < n; i++) hot.bounce(bounce(t0 + i * 600, i === 0 ? null : 600));
  return t0 + (n - 1) * 600;
}

describe("HotHand", () => {
  it(`heats up after ${HOT_BOUNCES} bounces in rhythm`, () => {
    const hot = new HotHand();
    const t = dribble(hot, HOT_BOUNCES - 1);
    expect(hot.isHot(t)).toBe(false);
    expect(hot.bounces(t)).toBe(HOT_BOUNCES - 1);
    hot.bounce(bounce(t + 600));
    expect(hot.isHot(t + 600)).toBe(true);
  });

  it("starts over on a bounce out of rhythm", () => {
    const hot = new HotHand();
    const t = dribble(hot, 3);
    hot.bounce(bounce(t + 2000, null));
    expect(hot.bounces(t + 2000)).toBe(1);
  });

  it("cools off if you don't shoot soon after dribbling", () => {
    const hot = new HotHand();
    const t = dribble(hot, HOT_BOUNCES);
    expect(hot.isHot(t + HOT_WINDOW_MS - 1)).toBe(true);
    expect(hot.isHot(t + HOT_WINDOW_MS + 1)).toBe(false);
    expect(hot.bounces(t + HOT_WINDOW_MS + 1)).toBe(0);
  });

  it("is used up by the next shot, hot or not", () => {
    const hot = new HotHand();
    const t = dribble(hot, HOT_BOUNCES);
    expect(hot.shoot(t + 1500)).toBe(true);
    expect(hot.shoot(t + 1600)).toBe(false);
    dribble(hot, 2, t + 2000);
    expect(hot.shoot(t + 3000)).toBe(false);
    expect(hot.bounces(t + 3000)).toBe(0);
  });
});

describe("hot-hand scoring", () => {
  const make = { scored: true, swish: false, bank: false, miss: null, error: 0, lateral: 0 };
  const swish = { ...make, swish: true };
  const miss = { scored: false, swish: false, bank: false, miss: "short" as const, error: -0.5, lateral: 0 };

  it("scores one streak tier up", () => {
    expect(hotMultiplier(0)).toBe(1.5);
    expect(hotMultiplier(3)).toBe(2);
    expect(hotMultiplier(5)).toBe(3);
    expect(scoreShot(make, 0, 1, true)).toMatchObject({ points: 3, multiplier: 1.5, hot: true });
    expect(scoreShot(swish, 5, 2, true).points).toBe(18);
  });

  it("never beats the top tier, so the API's per-make cap still holds", () => {
    const top = STREAK_TIERS[STREAK_TIERS.length - 1].multiplier;
    for (const streak of [0, 2, 4, 9, 10, 25]) expect(hotMultiplier(streak)).toBeLessThanOrEqual(top);
    expect(scoreShot(swish, 12, 1, true).points).toBe(9); // MAX_MAKE_POINTS.starter in the API
  });

  it("a hot miss is just a miss", () => {
    expect(scoreShot(miss, 4, 1, true)).toMatchObject({ points: 0, streak: 0, hot: false });
    const { tally } = addShot({ ...EMPTY_TALLY, streak: 4 }, miss, 1, true);
    expect(tally).toMatchObject({ points: 0, shots: 1, streak: 0 });
  });
});
