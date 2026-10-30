import { describe, expect, it } from "vitest";
import { dailyLabel, dailyRandom, dailyRules, isDailyKey, mix32, msUntilNextDaily } from "./daily";
import { DIFFICULTIES, rollWind } from "./difficulty";

// Same dates and answers as the API's tests/test_daily.py: if either side changes, both tests fail.
const PINNED = [
  ["2026-10-30", 3728926168, "starter", 60],
  ["2026-10-31", 2715940137, "allstar", 60],
  ["2027-01-01", 3536523236, "starter", 90],
] as const;

describe("daily challenge", () => {
  it.each(PINNED)("%s has the same rules as the API", (date, seed, difficulty, seconds) => {
    const rules = dailyRules(new Date(`${date}T13:45:00Z`));
    expect(mix32(Date.parse(date) / 86_400_000)).toBe(seed);
    expect(rules).toMatchObject({ date, seed, difficulty, seconds, key: `daily${date.replaceAll("-", "")}` });
  });

  it("is the same all UTC day and changes at midnight UTC", () => {
    expect(dailyRules(new Date("2026-10-30T00:00:00Z"))).toEqual(dailyRules(new Date("2026-10-30T23:59:59Z")));
    expect(dailyRules(new Date("2026-10-31T00:00:00Z")).key).toBe("daily20261031");
    expect(msUntilNextDaily(new Date("2026-10-30T23:00:00Z"))).toBe(3_600_000);
  });

  it("gives every player the same wind for the same shot", () => {
    const rules = dailyRules(new Date("2026-10-31T12:00:00Z")); // All-Star: has wind
    const winds = (n: number) => Array.from({ length: n }, (_, i) => rollWind(DIFFICULTIES[rules.difficulty], dailyRandom(rules, i)));
    expect(winds(20)).toEqual(winds(20));
    expect(new Set(winds(20)).size).toBeGreaterThan(5); // not the same gust every shot
    expect(winds(20).every((w) => Math.abs(w) <= DIFFICULTIES.allstar.windMax)).toBe(true);
  });

  it("labels keys", () => {
    expect(isDailyKey("daily20261030")).toBe(true);
    expect(isDailyKey("timed60")).toBe(false);
    expect(dailyLabel("daily20261030")).toBe("Oct 30");
  });
});
