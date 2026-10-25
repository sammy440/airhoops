import { describe, expect, it } from "vitest";
import { bestKey, formatDuration, modeWithClock, TIMED_OPTIONS } from "./modes";

describe("timed mode durations", () => {
  it("offers several shot clocks", () => {
    expect(TIMED_OPTIONS).toEqual([30, 60, 90, 120]);
  });

  it("formats durations for labels", () => {
    expect(formatDuration(30)).toBe("30s");
    expect(formatDuration(90)).toBe("90s");
    expect(formatDuration(60)).toBe("1 min");
    expect(formatDuration(120)).toBe("2 min");
  });

  it("applies the chosen clock only to Timed", () => {
    expect(modeWithClock("timed", 90).seconds).toBe(90);
    expect(modeWithClock("free", 90).seconds).toBeUndefined();
    expect(modeWithClock("streak", 90).seconds).toBeUndefined();
  });

  it("keeps bests separate per duration (scores aren't comparable)", () => {
    expect(bestKey("timed", "starter", 30)).not.toBe(bestKey("timed", "starter", 120));
    expect(bestKey("streak", "starter", 30)).toBe(bestKey("streak", "starter", 120));
  });
});

describe("custom shot clock", () => {
  it("keeps presets and snaps custom values to 1–30 whole minutes", async () => {
    const { clampTimedSeconds } = await import("./modes");
    expect(clampTimedSeconds(30)).toBe(30);
    expect(clampTimedSeconds(90)).toBe(90);
    expect(clampTimedSeconds(300)).toBe(300);
    expect(clampTimedSeconds(5)).toBe(60);
    expect(clampTimedSeconds(99999)).toBe(1800);
    expect(clampTimedSeconds(200)).toBe(180);
    expect(clampTimedSeconds("nope")).toBe(60);
  });

  it("labels custom durations in minutes", () => {
    expect(formatDuration(300)).toBe("5 min");
    expect(formatDuration(1800)).toBe("30 min");
  });
});
