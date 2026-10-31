import { describe, expect, it } from "vitest";
import { calibrate, calibratedLaunch, consistency, isOutlier, JUMP_GAIN } from "./calibration";
import { courtFor, DIFFICULTIES, DIFFICULTY_ORDER, rollWind } from "./difficulty";
import { hoopOffset, idealSpeed, simulateShot } from "./physics";
import { addShot, EMPTY_TALLY, scoreShot, streakMultiplier } from "./scoring";
import { DEFAULT_TUNING } from "./shot";

const make = { scored: true, swish: false, bank: false, miss: null, error: 0, lateral: 0 };
const swish = { ...make, swish: true };
const miss = { scored: false, swish: false, bank: false, miss: "short" as const, error: -0.5, lateral: 0 };

describe("scoring", () => {
  it("base 2, swish +1", () => {
    expect(scoreShot(make, 0).points).toBe(2);
    expect(scoreShot(swish, 0).points).toBe(3);
    expect(scoreShot(miss, 4)).toMatchObject({ points: 0, streak: 0 });
  });

  it("streak multiplier tiers apply from the shot after the streak is reached", () => {
    expect(streakMultiplier(2)).toBe(1);
    expect(streakMultiplier(3)).toBe(1.5);
    expect(streakMultiplier(5)).toBe(2);
    expect(streakMultiplier(12)).toBe(3);
    expect(scoreShot(swish, 5).points).toBe(6);
  });

  it("difficulty multiplies points and the tally tracks streaks", () => {
    expect(scoreShot(make, 0, 1.5).points).toBe(3);
    let t = EMPTY_TALLY;
    for (const r of [make, swish, make, miss, make]) t = addShot(t, r).tally;
    expect(t).toMatchObject({ makes: 4, shots: 5, swishes: 1, streak: 1, best: 3, points: 2 + 3 + 2 + 2 });
  });
});

describe("difficulty", () => {
  it("gets strictly harder: farther, smaller or equal rim, more sensitive", () => {
    for (let i = 1; i < DIFFICULTY_ORDER.length; i++) {
      const a = DIFFICULTIES[DIFFICULTY_ORDER[i - 1]];
      const b = DIFFICULTIES[DIFFICULTY_ORDER[i]];
      expect(b.distance).toBeGreaterThan(a.distance);
      expect(b.rimRadius).toBeLessThanOrEqual(a.rimRadius);
      expect(b.sensitivity).toBeGreaterThan(a.sensitivity);
    }
  });

  it("every level is makeable with an ideal shot when the hoop is still and there's no wind", () => {
    for (const id of DIFFICULTY_ORDER) {
      // A still hoop: on moving levels, timing the hoop is the player's job.
      const court = { ...courtFor(DIFFICULTIES[id]), hoopMotion: null };
      const v = idealSpeed(DEFAULT_TUNING.baseAngle, court)!;
      expect(simulateShot({ speed: v, angle: DEFAULT_TUNING.baseAngle }, court, { phase: 0 }).result.scored).toBe(true);
      expect(v).toBeLessThan(DEFAULT_TUNING.maxSpeed);
    }
  });

  it("rolls wind within range, in 0.1 steps, and none on easy levels", () => {
    expect(rollWind(DIFFICULTIES.rookie)).toBe(0);
    for (let i = 0; i < 50; i++) {
      const w = rollWind(DIFFICULTIES.legend);
      expect(Math.abs(w)).toBeLessThanOrEqual(1.2);
      expect(Math.round(w * 10)).toBeCloseTo(w * 10, 6);
    }
  });
});

describe("moving hoop and wind", () => {
  const court = courtFor(DIFFICULTIES.legend);
  const launch = { speed: idealSpeed(DEFAULT_TUNING.baseAngle, court)!, angle: DEFAULT_TUNING.baseAngle };

  it("is deterministic given the same phase and wind", () => {
    expect(simulateShot(launch, court, { phase: 3.21, wind: 0.7 })).toEqual(simulateShot(launch, court, { phase: 3.21, wind: 0.7 }));
  });

  it("a crosswind pushes the ball sideways, not further", () => {
    const still = { ...court, hoopMotion: null };
    // Compare where the ball is at the same moment mid-flight (before any contact).
    const at = (wind: number) => simulateShot(launch, still, { wind }).path.find(([t]) => t >= 0.6)!;
    expect(at(1.2)[3]).toBeGreaterThan(0.15);
    expect(at(-1.2)[3]).toBeLessThan(-0.15);
    expect(at(1.2)[1]).toBe(at(0)[1]);
  });

  it("the hoop position follows the shared offset function", () => {
    expect(hoopOffset(court, 0)).toBe(0);
    const quarter = 1 / (4 * court.hoopMotion!.frequency);
    expect(hoopOffset(court, quarter)).toBeCloseTo(court.hoopMotion!.amplitude, 6);
  });
});

describe("calibration", () => {
  const practice = (speeds: number[], jump = 0) => speeds.map((speed) => ({ speed, jump, lean: -0.05 }));
  const cal = calibrate(practice([2.4, 2.8, 3.2]), "right");
  const ev = { armSpeed: cal.avg, jump: 0, angle: 30, arc: 0.7 };

  it("summarizes the practice throws", () => {
    expect(cal.avg).toBeCloseTo(2.8, 6);
    expect(cal.leanCenter).toBe(-0.05);
    expect(consistency(cal)).toBeCloseTo(0.4 / 2.8, 6);
  });

  it("makes your average throw score at every difficulty", () => {
    for (const id of DIFFICULTY_ORDER) {
      const d = DIFFICULTIES[id];
      const court = { ...courtFor(d), hoopMotion: null };
      const { launch } = calibratedLaunch(ev, cal, court, d);
      expect(simulateShot(launch, court).result.scored).toBe(true);
    }
  });

  it("throwing harder than your average goes long, softer goes short", () => {
    const d = DIFFICULTIES.starter;
    const court = courtFor(d);
    const hard = simulateShot(calibratedLaunch({ ...ev, armSpeed: cal.avg * 1.3 }, cal, court, d).launch, court).result;
    const soft = simulateShot(calibratedLaunch({ ...ev, armSpeed: cal.avg * 0.7 }, cal, court, d).launch, court).result;
    expect(hard.error).toBeGreaterThan(0);
    expect(soft.error).toBeLessThan(0);
  });

  it("is more forgiving on easier levels", () => {
    const deviation = (id: keyof typeof DIFFICULTIES) => {
      const d = DIFFICULTIES[id];
      const court = courtFor(d);
      const avg = calibratedLaunch(ev, cal, court, d).launch.speed;
      return Math.abs(calibratedLaunch({ ...ev, armSpeed: cal.avg * 1.2 }, cal, court, d).launch.speed / avg - 1);
    };
    expect(deviation("rookie")).toBeLessThan(deviation("legend"));
  });

  it("jumping harder than in practice throws further; jumping like in practice still scores", () => {
    const d = DIFFICULTIES.starter;
    const court = { ...courtFor(d), hoopMotion: null };
    const stood = calibratedLaunch(ev, cal, court, d).launch;
    const jumped = calibratedLaunch({ ...ev, jump: 1 }, cal, court, d).launch;
    expect(jumped.speed / stood.speed).toBeCloseTo(1 + JUMP_GAIN, 6);
    expect(simulateShot(jumped, court).result.error).toBeGreaterThan(0); // long
    // A player who jumps every time (and did in practice) isn't pushed long by it.
    const jumper = calibrate(practice([2.4, 2.8, 3.2], 0.9), "right");
    expect(simulateShot(calibratedLaunch({ ...ev, jump: 0.9 }, jumper, court, d).launch, court).result.scored).toBe(true);
  });

  it("flags wild practice throws", () => {
    expect(isOutlier([2.5, 2.7], 6)).toBe(true);
    expect(isOutlier([2.5, 2.7], 2.9)).toBe(false);
  });
});
