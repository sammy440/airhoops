import { describe, expect, it } from "vitest";
import type { ShotResult } from "./physics";
import { REPLAY_LEAD, REPLAY_TAIL, SWISH_REPLAY_GAP, replayReason, replayWindow } from "./replay";

const shot = (over: Partial<ShotResult> = {}): ShotResult => ({ scored: true, swish: false, bank: false, miss: null, error: 0, lateral: 0, ...over });

describe("replayReason", () => {
  it("never replays a miss", () => {
    expect(replayReason(shot({ scored: false, bank: true }), 0, 99)).toBeNull();
  });

  it("replays every bank shot", () => {
    expect(replayReason(shot({ bank: true }), 1, 0)).toBe("BANK SHOT");
  });

  it("replays catching fire and every five after", () => {
    expect(replayReason(shot(), 5, 0)).toBe("ON FIRE");
    expect(replayReason(shot({ bank: true }), 10, 0)).toBe("10 IN A ROW");
    expect(replayReason(shot(), 6, 0)).toBeNull();
  });

  it("replays a swish only after a gap since the last replay", () => {
    expect(replayReason(shot({ swish: true }), 1, SWISH_REPLAY_GAP - 1)).toBeNull();
    expect(replayReason(shot({ swish: true }), 1, SWISH_REPLAY_GAP)).toBe("NOTHING BUT NET");
  });

  it("skips a plain make", () => {
    expect(replayReason(shot(), 2, 99)).toBeNull();
  });
});

describe("replayWindow", () => {
  it("ends shortly after the ball drops through, within the flight", () => {
    expect(replayWindow(1.5, 4)).toEqual({ from: 1.5 - REPLAY_LEAD, to: 1.5 + REPLAY_TAIL });
    expect(replayWindow(0.5, 0.7)).toEqual({ from: 0, to: 0.7 });
  });
});
