import { describe, expect, it } from "vitest";
import { CLUTCH_SECONDS, inClutch } from "./clutch";
import { courtFor, DIFFICULTIES, DIFFICULTY_ORDER } from "./difficulty";
import { hoopOffset } from "./physics";
import { scoreShot } from "./scoring";

describe("clutch time", () => {
  it("is the last ten seconds of the clock", () => {
    expect(CLUTCH_SECONDS).toBe(10);
    expect(inClutch(49.9, 60)).toBe(false);
    expect(inClutch(50, 60)).toBe(true);
    expect(inClutch(59.5, 60)).toBe(true);
  });

  it("doubles a make", () => {
    const made = { scored: true, swish: false, bank: false, miss: null, error: 0, lateral: 0 };
    expect(scoreShot(made, 0, 2).points).toBe(scoreShot(made, 0, 1).points * 2);
  });

  it("leaves the hoop where it is, at every level", () => {
    for (const id of DIFFICULTY_ORDER) {
      const court = courtFor(DIFFICULTIES[id]);
      for (const phase of [0, 12.3, 55, 58.9]) expect(hoopOffset(court, phase)).toBe(0);
    }
  });
});
