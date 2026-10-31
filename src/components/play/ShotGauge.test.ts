import { describe, expect, it } from "vitest";
import { shotTip, type LastShot } from "./ShotGauge";

const miss = { scored: false, swish: false, bank: false, miss: "right" as const, error: 0, lateral: 0.3 };
const shot = (o: Partial<LastShot>): LastShot => ({
  power: 0.4,
  angle: 52,
  aim: 0,
  input: "camera",
  result: miss,
  window: { lo: 0.38, hi: 0.44 },
  aimTarget: 0,
  aimTolerance: 1.3,
  ...o,
});

describe("shotTip", () => {
  it("only wide: says which way to lean, not to change power", () => {
    expect(shotTip(shot({ aim: 4 }))).toBe("Wide right: lean a little left.");
  });

  it("keyboard players get degrees and the key", () => {
    expect(shotTip(shot({ aim: -3, input: "keys" }))).toBe("Wide left: aim 3° right (→).");
  });

  it("wide and short: both fixes", () => {
    expect(shotTip(shot({ aim: 4, power: 0.3 }))).toBe("Wide right and short: lean a little left and push about 10% harder.");
  });

  it("only distance: the old advice", () => {
    expect(shotTip(shot({ power: 0.5 }))).toBe("Long: ease off about 8%.");
  });

  it("an arc that can't reach", () => {
    expect(shotTip(shot({ window: null }))).toBe("That arc can't reach. Raise your hands higher at release.");
  });
});
