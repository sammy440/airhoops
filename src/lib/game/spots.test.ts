import { describe, expect, it } from "vitest";
import { DIFFICULTIES } from "./difficulty";
import { bestKey, MODES } from "./modes";
import { FIRST_SPOT, GOLD_MULTIPLIER, isSpotMode, ladderNext, nextSpot, RACK_BALLS, RACK_SHOTS, rackBall, SPOT_BOARD_DIFFICULTY, SPOTS } from "./spots";
import { scoreShot } from "./scoring";

describe("spots", () => {
  it("run near to far, each one a level's court", () => {
    expect(SPOTS).toEqual(["rookie", "starter", "allstar", "legend"]);
    for (let i = 1; i < SPOTS.length; i++) expect(DIFFICULTIES[SPOTS[i]].distance).toBeGreaterThan(DIFFICULTIES[SPOTS[i - 1]].distance);
    expect(FIRST_SPOT).toBe("rookie");
  });

  it("are posted with the deepest spot's difficulty (the highest a make can score)", () => {
    for (const id of SPOTS) expect(DIFFICULTIES[SPOT_BOARD_DIFFICULTY].scoreMultiplier).toBeGreaterThanOrEqual(DIFFICULTIES[id].scoreMultiplier);
  });

  it("have one board per mode, whatever the level", () => {
    expect(bestKey("ladder", "rookie")).toBe("ladder");
    expect(bestKey("racks", "legend", 90)).toBe("racks");
    expect(isSpotMode("ladder") && isSpotMode("racks") && !isSpotMode("timed")).toBe(true);
  });
});

describe("Ladder", () => {
  it("moves back on a make and in on a miss, within the spots", () => {
    expect(ladderNext("rookie", true)).toBe("starter");
    expect(ladderNext("allstar", false)).toBe("starter");
    expect(ladderNext("rookie", false)).toBe("rookie");
    expect(ladderNext("legend", true)).toBe("legend");
    expect(MODES.ladder.seconds).toBe(60);
  });

  it("climbs to the deep three in three makes", () => {
    let s = FIRST_SPOT;
    for (let n = 1; n <= 3; n++) s = nextSpot("ladder", s, n, true);
    expect(s).toBe("legend");
  });
});

describe("Rack Run", () => {
  it("is five balls from each spot, near to far, the last of each gold", () => {
    expect(RACK_SHOTS).toBe(RACK_BALLS * SPOTS.length);
    expect(MODES.racks.shots).toBe(RACK_SHOTS);
    const balls = Array.from({ length: RACK_SHOTS }, (_, n) => rackBall(n)!);
    expect(balls.map((b) => b.spot)).toEqual(SPOTS.flatMap((s) => Array(RACK_BALLS).fill(s)));
    expect(balls.filter((b) => b.gold).map((b) => b.ball)).toEqual(SPOTS.map(() => RACK_BALLS - 1));
    expect(rackBall(RACK_SHOTS)).toBeNull();
    expect(rackBall(-1)).toBeNull();
  });

  it("moves on to the next rack after the gold ball, made or missed", () => {
    expect(nextSpot("racks", "rookie", 4, true)).toBe("rookie");
    expect(nextSpot("racks", "rookie", 5, false)).toBe("starter");
    expect(nextSpot("racks", "legend", RACK_SHOTS, true)).toBe("legend"); // the run's over
  });

  it("doubles a gold make", () => {
    const made = { scored: true, swish: false, bank: false, miss: null, error: 0, lateral: 0 };
    expect(scoreShot(made, 0, GOLD_MULTIPLIER).points).toBe(2 * scoreShot(made, 0).points);
  });
});
