import { describe, expect, it } from "vitest";
import { CLUTCH_SECONDS, clutchMotion, inClutch, shotCourt } from "./clutch";
import { courtFor, DIFFICULTIES } from "./difficulty";
import { samplePath } from "./engine";
import { GhostPlayer } from "./ghostRun";
import { hoopOffset, idealSpeed, simulateShot } from "./physics";
import { scoreShot } from "./scoring";

const still = courtFor(DIFFICULTIES.starter);
const moving = courtFor(DIFFICULTIES.allstar);

describe("clutch time", () => {
  it("is the last ten seconds of the clock", () => {
    expect(inClutch(49.9, 60)).toBe(false);
    expect(inClutch(50, 60)).toBe(true);
    expect(inClutch(59.5, 60)).toBe(true);
  });

  it("starts a still hoop sliding from the middle, without a jump", () => {
    const from = 53.2;
    const court = { ...still, hoopMotion: clutchMotion(still, from) };
    expect(hoopOffset(court, from - 5)).toBe(0);
    expect(hoopOffset(court, from)).toBe(0);
    expect(Math.abs(hoopOffset(court, from + 0.05))).toBeLessThan(0.02);
    expect(Math.max(...Array.from({ length: 100 }, (_, i) => Math.abs(hoopOffset(court, from + i / 10))))).toBeGreaterThan(0.25);
  });

  it("leaves a hoop that already moves as it was", () => {
    expect(clutchMotion(moving, 50)).toBe(moving.hoopMotion);
    expect(shotCourt(moving, { t: 55, phase: 58 }, 60)).toBe(moving);
  });

  it("doubles a make", () => {
    const made = { scored: true, swish: false, bank: false, miss: null, error: 0, lateral: 0 };
    expect(scoreShot(made, 0, 2).points).toBe(scoreShot(made, 0, 1).points * 2);
  });

  it("re-flies a clutch shot on the court it was thrown on (ghosts and challenge links)", () => {
    // Clutch time began at run time 50, hoop phase 53.4 (the countdown ran first); a shot at run time 54.
    const shot = { t: 54, phase: 57.4 };
    const court = { ...still, hoopMotion: clutchMotion(still, 53.4) };
    expect(shotCourt(still, shot, 60).hoopMotion).toEqual(court.hoopMotion);
    // Thrown straight at the middle while the hoop has slid away: a miss there, though it'd score on the still court
    const launch = { speed: idealSpeed(52, still)!, angle: 52, aim: 0 };
    const live = simulateShot(launch, court, { phase: shot.phase });
    expect(simulateShot(launch, still, { phase: shot.phase }).result.scored).toBe(true);
    expect(live.result.scored).toBe(false);
    // The ghost's ball follows the clutch flight (off the rim), not the still court's (through the net)
    const ghost = new GhostPlayer({ points: 0, shots: [{ ...shot, ...launch, wind: 0, points: 0 }] }, (s) => shotCourt(still, s, 60));
    const quiet = simulateShot(launch, still, { phase: shot.phase });
    const at = Math.min(live.duration, quiet.duration) - 0.02;
    const g = ghost.ballAt(shot.t + at)!;
    const near = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    expect(near(g, samplePath(live.path, at))).toBeLessThan(0.001);
    expect(near(g, samplePath(quiet.path, at))).toBeGreaterThan(0.05);
    expect(CLUTCH_SECONDS).toBe(10);
  });
});
