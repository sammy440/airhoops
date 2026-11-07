import { describe, expect, it } from "vitest";
import type { ShootingStats, ShotTotals } from "@/lib/net/api";
import { dailyRates, insights, weeks } from "./trends";

const TODAY = new Date("2026-11-06T12:00:00Z");
const t = (shots: number, makes: number, misses: ShotTotals["misses"] = {}): ShotTotals => ({ shots, makes, swishes: 0, banks: 0, misses });

function stats(by_day: ShootingStats["by_day"], extra: Partial<ShootingStats> = {}): ShootingStats {
  const all = by_day.flatMap((d) => [d.solo, d.match]).filter((x): x is ShotTotals => !!x);
  const misses: ShotTotals["misses"] = {};
  for (const r of all) for (const [k, n] of Object.entries(r.misses)) misses[k as keyof typeof misses] = (misses[k as keyof typeof misses] ?? 0) + n!;
  const totals = { shots: all.reduce((a, r) => a + r.shots, 0), makes: all.reduce((a, r) => a + r.makes, 0), swishes: 0, banks: 0, misses };
  return { days: 30, totals, solo: totals, match: t(0, 0), by_day, miss_bias: null, record: {}, ...extra };
}

describe("shooting trends", () => {
  it("splits the last two weeks, today included", () => {
    const s = stats([
      { day: "2026-10-20", solo: t(99, 99), match: null }, // too old
      { day: "2026-10-24", solo: t(30, 10), match: null },
      { day: "2026-10-31", solo: t(10, 5), match: t(10, 5) },
      { day: "2026-11-06", solo: t(20, 15), match: null },
    ]);
    const { thisWeek, lastWeek } = weeks(s, TODAY);
    expect([thisWeek.shots, thisWeek.makes]).toEqual([40, 25]);
    expect([lastWeek.shots, lastWeek.makes]).toEqual([30, 10]);
  });

  it("says when the make rate moved week on week", () => {
    const up = stats([
      { day: "2026-10-26", solo: t(40, 16), match: null },
      { day: "2026-11-05", solo: t(40, 24), match: null },
    ]);
    expect(insights(up, TODAY)[0]).toMatchObject({ id: "up", title: "Up 20 points this week" });
    const steady = stats([
      { day: "2026-10-26", solo: t(40, 21), match: null }, // 53%
      { day: "2026-11-05", solo: t(40, 22), match: null }, // 55%
    ]);
    expect(insights(steady, TODAY)[0]).toMatchObject({ id: "steady", title: "Steady at 55%" });
    // Too few shots in a week: nothing to compare
    expect(insights(stats([{ day: "2026-11-05", solo: t(40, 24), match: null }]), TODAY)).toEqual([]);
  });

  it("names a miss habit only when one kind dominates", () => {
    const short = stats([{ day: "2026-11-05", solo: t(20, 8, { short: 8, left: 2, rim: 2 }), match: null }]);
    expect(insights(short, TODAY)).toEqual([expect.objectContaining({ id: "short", title: "8 of 12 misses fell short" })]);
    const mixed = stats([{ day: "2026-11-05", solo: t(20, 8, { short: 3, long: 3, left: 3, right: 3 }), match: null }]);
    expect(insights(mixed, TODAY)).toEqual([]);
  });

  it("reads where refereed misses land, without repeating the miss habit", () => {
    const base = [{ day: "2026-11-05", solo: null, match: t(20, 8, { long: 3, left: 3, rim: 3, short: 3 }) }];
    expect(insights(stats(base, { miss_bias: { misses: 12, depth: 0.32, side: -0.05 } }), TODAY)).toEqual([
      expect.objectContaining({ id: "bias-long", title: "In matches, misses land 32 cm long" }),
    ]);
    expect(insights(stats(base, { miss_bias: { misses: 12, depth: 0.05, side: -0.2 } }), TODAY)[0].title).toBe("In matches, misses land 20 cm to the left");
    expect(insights(stats(base, { miss_bias: { misses: 12, depth: 0.05, side: 0.1 } }), TODAY)).toEqual([]);
    const shortHabit = [{ day: "2026-11-05", solo: null, match: t(20, 8, { short: 10, left: 2 }) }];
    expect(insights(stats(shortHabit, { miss_bias: { misses: 12, depth: -0.4, side: 0 } }), TODAY).map((i) => i.id)).toEqual(["short"]);
  });

  it("gives a make rate per day", () => {
    const s = stats([{ day: "2026-11-05", solo: t(10, 5), match: t(10, 9) }]);
    expect(dailyRates(s)).toEqual([["2026-11-05", 70, 20]]);
  });
});
