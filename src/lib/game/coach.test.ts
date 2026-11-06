import { describe, expect, it } from "vitest";
import { coachRun, type CoachShot } from "./coach";
import type { MissKind } from "./physics";

const WINDOW = { lo: 0.4, hi: 0.46 };

/** A shot thrown on camera, straight at the rim, scored or missed as given. */
function shot(over: Partial<CoachShot> & { miss?: MissKind | null } = {}): CoachShot {
  const { miss = null, ...rest } = over;
  return {
    power: 0.43,
    aim: 0,
    aimTarget: 0,
    aimTolerance: 1,
    window: WINDOW,
    input: "camera",
    result: { scored: miss === null, swish: miss === null, bank: false, miss, error: 0, lateral: 0 },
    ...rest,
  };
}

describe("coachRun", () => {
  it("counts misses by kind and plots every shot", () => {
    const r = coachRun([shot(), shot({ miss: "short" }), shot({ miss: "short" }), shot({ miss: "rim" })]);
    expect(r).toMatchObject({ shots: 4, makes: 1, misses: { short: 2, rim: 1 } });
    expect(r.marks).toHaveLength(4);
  });

  it("says nothing on too few shots", () => {
    expect(coachRun([shot({ power: 0.2, miss: "short" }), shot({ power: 0.2, miss: "short" })]).tips).toEqual([]);
  });

  it("spots shots that keep falling short, and suggests a jump to someone who doesn't", () => {
    const r = coachRun([shot({ power: 0.3, jump: 0, miss: "short" }), shot({ power: 0.32, jump: 0.1, miss: "short" }), shot({ power: 0.35, jump: 0, miss: "short" }), shot()]);
    expect(r.tips[0]).toMatchObject({ id: "short", title: "3 shots fell short" });
    expect(r.tips[0].body).toMatch(/jump/);
  });

  it("talks keys to keyboard players", () => {
    const r = coachRun([0.55, 0.56, 0.58].map((power) => shot({ power, input: "keys", miss: "long" })));
    expect(r.tips[0]).toMatchObject({ id: "long" });
    expect(r.tips[0].body).toMatch(/charge/);
  });

  it("spots a drift to one side and says which way to fix it", () => {
    const r = coachRun([-3, -2.5, -4, 0].map((aim) => shot({ aim, miss: aim ? "left" : null })));
    expect(r.tips[0]).toMatchObject({ id: "left", title: "3 shots drifted left" });
    expect(r.tips[0].body).toMatch(/right/);
  });

  it("calls out flat shots that can't reach", () => {
    const r = coachRun([shot({ window: null, miss: "short" }), shot({ window: null, miss: "short" }), shot()]);
    expect(r.tips[0].id).toBe("arc");
  });

  it("calls out power all over the place when it doesn't lean either way", () => {
    const r = coachRun([0.25, 0.6, 0.3, 0.58].map((power) => shot({ power, miss: power < 0.4 ? "short" : "long" })));
    expect(r.tips.map((t) => t.id)).toContain("spread");
  });

  it("says rim-outs are close only when nothing else explains them", () => {
    expect(coachRun([shot({ miss: "rim" }), shot({ miss: "rim" }), shot()]).tips[0].id).toBe("rim");
    const drifting = coachRun([-3, -3, -3].map((aim) => shot({ aim, miss: "rim" })));
    expect(drifting.tips.map((t) => t.id)).toEqual(["left"]);
  });

  it("cheers a hot run on with a step up", () => {
    const r = coachRun([shot(), shot(), shot(), shot(), shot({ miss: "rim" })]);
    expect(r.tips[0]).toMatchObject({ id: "locked", title: "80% from the floor" });
  });

  it("gives at most two tips, the biggest first", () => {
    const r = coachRun([
      shot({ power: 0.2, aim: -4, miss: "short" }),
      shot({ power: 0.22, aim: -4, miss: "short" }),
      shot({ power: 0.25, aim: -5, miss: "short" }),
      shot({ window: null, miss: "airball" }),
      shot({ window: null, miss: "airball" }),
    ]);
    expect(r.tips).toHaveLength(2);
    expect(r.tips[0].id).toBe("short");
  });
});
