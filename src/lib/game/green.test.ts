import { describe, expect, it } from "vitest";
import { courtFor, DIFFICULTIES, DIFFICULTY_ORDER } from "./difficulty";
import { GREEN_CYCLE_S, greenLaunch, greenLoop, isGreen, untilGreen, greenSounds } from "./green";
import { simulateShot } from "./physics";

describe("green rim timing", () => {
  it("loops every 3 s and is green around the front", () => {
    expect(greenLoop(0)).toBe(0);
    expect(greenLoop(1.5)).toBe(0.5);
    expect(greenLoop(4.5)).toBe(0.5);
    expect(greenLoop(-1.5)).toBe(0.5);
    expect(isGreen(1.5, 0.6)).toBe(true);
    expect(isGreen(1.79, 0.6)).toBe(true);
    expect(isGreen(1.81, 0.6)).toBe(false);
    expect(isGreen(0, 0.6)).toBe(false);
  });

  it("is green for exactly the window in each loop, shorter on harder levels", () => {
    for (const id of DIFFICULTY_ORDER) {
      const w = DIFFICULTIES[id].greenWindow;
      let green = 0;
      const step = 0.001;
      for (let t = 0; t < GREEN_CYCLE_S; t += step) if (isGreen(t, w)) green += step;
      expect(green).toBeCloseTo(w, 2);
    }
    const windows = DIFFICULTY_ORDER.map((id) => DIFFICULTIES[id].greenWindow);
    expect([...windows].sort((a, b) => b - a)).toEqual(windows);
  });

  it("counts down to the next green", () => {
    expect(untilGreen(1.5, 0.6)).toBe(0);
    expect(untilGreen(1.0, 0.6)).toBeCloseTo(0.2, 9);
    expect(untilGreen(2.0, 0.6)).toBeCloseTo(2.2, 9);
  });
});

describe("greenLaunch", () => {
  it("swishes on every level, whatever the wind and wherever the hoop is", () => {
    for (const id of DIFFICULTY_ORDER) {
      const d = DIFFICULTIES[id];
      const court = courtFor(d);
      for (const wind of [0, d.windMax, -d.windMax]) {
        for (let phase = 0; phase < 6; phase += 0.37) {
          const launch = greenLaunch(court, { wind, phase });
          expect(launch, `${id} wind ${wind} phase ${phase}`).not.toBeNull();
          expect(simulateShot(launch!, court, { wind, phase }).result.swish, `${id} wind ${wind} phase ${phase}`).toBe(true);
        }
      }
    }
  });
});

describe("green rim sounds", () => {
  it("ticks once as it comes and chimes once as it lights", () => {
    const countdown = [1.2, 0.9, 0.6, 0.5, 0.4, 0.2, 0.1, 0, 0, 0, 2.4, 2.1];
    const played = countdown.map((next, i) => greenSounds(i ? countdown[i - 1] : null, next));
    expect(played).toEqual([null, null, null, "soon", null, null, null, "on", null, null, null, null]);
  });

  it("says nothing while the ball's away, and picks up when it's back", () => {
    expect(greenSounds(0.4, null)).toBeNull();
    expect(greenSounds(null, 0.3)).toBe("soon");
    expect(greenSounds(null, 0)).toBe("on");
  });
});
