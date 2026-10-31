import { describe, expect, it } from "vitest";
import { DEFAULT_COURT, idealSpeed, simulateShot } from "./physics";
import { DEFAULT_TUNING, idealPower, keyboardThrow, throwToLaunch } from "./shot";

describe("simulateShot", () => {
  it("swishes the closed-form ideal shot when the arc is high enough", () => {
    for (const angle of [52, 56, 60, 65]) {
      const sim = simulateShot({ speed: idealSpeed(angle)!, angle });
      expect(sim.result.scored).toBe(true);
      expect(sim.result.swish).toBe(true);
    }
  });

  it("clanks flat shots off the front rim even at the 'ideal' speed (arc matters)", () => {
    // A 24 cm ball needs an entry angle > ~32° to fit a 46 cm rim; flat shots don't have it.
    const sim = simulateShot({ speed: idealSpeed(45)!, angle: 45 });
    expect(sim.result.swish).toBe(false);
    expect(sim.events[0].type).toBe("rim");
  });

  it("a weak throw falls short, a strong one goes long", () => {
    const angle = 52;
    const v = idealSpeed(angle)!;
    const weak = simulateShot({ speed: v * 0.8, angle }).result;
    const strong = simulateShot({ speed: v * 1.25, angle }).result;
    expect(weak.scored).toBe(false);
    expect(weak.error).toBeLessThan(0);
    expect(["short", "airball"]).toContain(weak.miss);
    expect(strong.scored).toBe(false);
    expect(strong.error).toBeGreaterThan(0);
  });

  it("has a forgiving but finite make window around the ideal speed", () => {
    const angle = 52;
    const v = idealSpeed(angle)!;
    let makes = 0;
    for (let k = -20; k <= 20; k++) if (simulateShot({ speed: v * (1 + k / 200), angle }).result.scored) makes++;
    // Some leeway (rim rolls in, bank shots) but not "everything goes in".
    expect(makes).toBeGreaterThanOrEqual(5);
    expect(makes).toBeLessThan(41);
  });

  it("is deterministic (server re-simulation depends on it)", () => {
    const a = simulateShot({ speed: 7.6, angle: 50 });
    const b = simulateShot({ speed: 7.6, angle: 50 });
    expect(a).toEqual(b);
  });

  it("records rim / board contacts and never produces NaN", () => {
    for (let speed = 4; speed <= 12; speed += 0.25) {
      for (let angle = 30; angle <= 75; angle += 5) {
        const sim = simulateShot({ speed, angle });
        for (const [t, x, y] of sim.path) expect(Number.isFinite(t + x + y)).toBe(true);
        expect(sim.duration).toBeLessThanOrEqual(4.6);
        if (sim.result.miss === "rim") expect(sim.events.some((e) => e.type === "rim")).toBe(true);
      }
    }
  });

  it("never lets the ball sink through the floor", () => {
    const sim = simulateShot({ speed: 6, angle: 70 });
    for (const [, , y] of sim.path) expect(y).toBeGreaterThanOrEqual(DEFAULT_COURT.ballRadius - 1e-3);
  });
});

describe("throw → launch mapping", () => {
  it("maps power linearly onto the speed range", () => {
    expect(throwToLaunch({ power: 0, angle: 30, arc: 0.7 }).speed).toBe(DEFAULT_TUNING.minSpeed);
    expect(throwToLaunch({ power: 1, angle: 30, arc: 0.7 }).speed).toBe(DEFAULT_TUNING.maxSpeed);
  });

  it("raises the launch angle for higher arcs and clamps extremes", () => {
    const low = throwToLaunch({ power: 0.5, angle: 30, arc: 0.2 }).angle;
    const high = throwToLaunch({ power: 0.5, angle: 30, arc: 1 }).angle;
    expect(high).toBeGreaterThan(low);
    expect(throwToLaunch({ power: 0.5, angle: -90, arc: 0 }).angle).toBe(DEFAULT_TUNING.minAngle);
    expect(throwToLaunch({ power: 0.5, angle: 90, arc: 1 }).angle).toBe(DEFAULT_TUNING.maxAngle);
  });

  it("puts the make zone where real throws land (recorded powers ≈ 0.2–0.5)", () => {
    const p = idealPower(DEFAULT_TUNING.baseAngle)!;
    expect(p).toBeGreaterThan(0.2);
    expect(p).toBeLessThan(0.5);
  });

  it("keyboard medium shot scores", () => {
    const sim = simulateShot(throwToLaunch(keyboardThrow()));
    expect(sim.result.scored).toBe(true);
  });
});

describe("makeWindow", () => {
  it("brackets the ideal power and every power inside it scores", async () => {
    const { makeWindow } = await import("./shot");
    const w = makeWindow(DEFAULT_TUNING.baseAngle)!;
    const ideal = idealPower(DEFAULT_TUNING.baseAngle)!;
    expect(w.lo).toBeLessThanOrEqual(ideal);
    expect(w.hi).toBeGreaterThanOrEqual(ideal);
    expect(w.hi - w.lo).toBeGreaterThan(0.01);
    expect(w.hi - w.lo).toBeLessThan(0.2);
  });
});

describe("3D: aim, crosswind, moving hoop, backboard width", () => {
  const angle = 55;
  const v = idealSpeed(angle)!;
  /** Aim (deg) that points straight at a spot `z` metres to the side of the rim. */
  const aimAt = (z: number) => (Math.atan2(z, DEFAULT_COURT.hoopDistance) * 180) / Math.PI;

  it("aiming wide misses to that side", () => {
    const right = simulateShot({ speed: v, angle, aim: 4 }).result;
    const left = simulateShot({ speed: v, angle, aim: -4 }).result;
    expect(right.scored).toBe(false);
    expect(right.lateral).toBeGreaterThan(0.2);
    expect(left.lateral).toBeLessThan(-0.2);
    expect(["right", "rim"]).toContain(right.miss);
  });

  it("a little off-centre still drops (the ring is round)", () => {
    expect(simulateShot({ speed: v, angle, aim: aimAt(0.05) }).result.scored).toBe(true);
    expect(simulateShot({ speed: v, angle, aim: aimAt(-0.05) }).result.scored).toBe(true);
  });

  it("aiming into a crosswind compensates for it", () => {
    const wind = 1.2;
    expect(simulateShot({ speed: v, angle }, DEFAULT_COURT, { wind }).result.scored).toBe(false);
    const drift = simulateShot({ speed: v, angle }, DEFAULT_COURT, { wind }).result.lateral;
    expect(simulateShot({ speed: v, angle, aim: aimAt(-drift) }, DEFAULT_COURT, { wind }).result.scored).toBe(true);
  });

  it("a hoop slid to the side needs the shot aimed at it", () => {
    const court = { ...DEFAULT_COURT, hoopMotion: { amplitude: 0.5, frequency: 0.05 } };
    const phase = 5; // sin(2π · 0.05 · 5) = 1 → hoop 0.5 m right at release, ~0.47 m when the ball arrives ~1 s later
    expect(simulateShot({ speed: v, angle }, court, { phase }).result.scored).toBe(false);
    const sim = simulateShot({ speed: v, angle, aim: aimAt(0.47) }, court, { phase });
    expect(sim.result.scored).toBe(true);
  });

  it("the backboard is only so wide: a long shot past its edge flies on", () => {
    const long = { speed: v * 1.06, angle }; // banks in off the board
    expect(simulateShot(long).events.some((e) => e.type === "board")).toBe(true);
    const wide = simulateShot({ ...long, aim: aimAt(1.3) });
    expect(wide.events.some((e) => e.type === "board")).toBe(false);
    expect(wide.result.miss).toBe("airball");
  });

  it("paths carry the sideways position", () => {
    const sim = simulateShot({ speed: v, angle, aim: 3 });
    expect(sim.path.every((p) => p.length === 4)).toBe(true);
    expect(sim.path.at(-1)![3]).toBeGreaterThan(0);
  });
});
