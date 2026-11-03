import { describe, expect, it } from "vitest";
import { GhostPlayer, type GhostShot } from "./ghostRun";
import { DEFAULT_COURT, idealSpeed, simulateShot } from "./physics";

const make: GhostShot = { t: 3, speed: idealSpeed(52)!, angle: 52, aim: 0, wind: 0, phase: 3, points: 3 };
const miss: GhostShot = { t: 8, speed: 5, angle: 30, aim: 0, wind: 0, phase: 8, points: 0 };

describe("GhostPlayer", () => {
  const ghost = new GhostPlayer({ points: 3, shots: [make, miss] }, DEFAULT_COURT);

  it("flies each shot exactly as it was simulated", () => {
    const sim = simulateShot({ speed: make.speed, angle: 52, aim: 0 }, DEFAULT_COURT, { wind: 0, phase: 3 });
    const mid = sim.path[Math.floor(sim.path.length / 2)];
    const p = ghost.ballAt(make.t + mid[0])!;
    expect(p.x).toBeCloseTo(mid[1], 6);
    expect(p.y).toBeCloseTo(mid[2], 6);
  });

  it("has no ball before its first shot or between shots", () => {
    expect(ghost.ballAt(1)).toBeNull();
    expect(ghost.ballAt(7.9)).toBeNull();
    expect(ghost.ballAt(8.1)).not.toBeNull();
  });

  it("counts a make's points once the ball drops through", () => {
    expect(ghost.pointsAt(3.05)).toBe(0);
    expect(ghost.pointsAt(7)).toBe(3);
    expect(ghost.pointsAt(60)).toBe(3);
  });
});
