import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import type { Recording } from "@/lib/recorder/recording";
import fixture from "./__fixtures__/recordings.json";
import { KinematicsTracker, type ArmKinematics, type KinematicsFrame, type Side } from "./kinematics";
import { LM, UPPER_BODY } from "./landmarks";
import { DEFAULT_SMOOTHING, PoseSmoother } from "./oneEuroFilter";
import { RaiseHandDetector, type RaiseHandEvent } from "./raiseHandDetector";

const FRAME_MS = 1000 / 30;

const arm = (side: Side, height: number, speed = 0.2): ArmKinematics => ({
  side,
  wrist: { x: 0.5, y: 0.5 },
  velocity: { x: 0, y: -speed },
  speed,
  angle: 90,
  elbowAngle: 170,
  extension: Math.abs(height),
  height,
  belowHip: -1 - height,
});

const frame = (t: number, left: number | null, right: number | null, speed = 0.2): KinematicsFrame => ({
  t,
  scale: 0.3,
  arms: { left: left === null ? null : arm("left", left, speed), right: right === null ? null : arm("right", right, speed) },
  hand: "right",
  autoHand: "right",
});

/** Feed `ms` of the same pose; returns the events. */
function hold(det: RaiseHandDetector, t0: number, ms: number, left: number | null, right: number | null, speed?: number) {
  const events: RaiseHandEvent[] = [];
  for (let t = t0; t < t0 + ms; t += FRAME_MS) {
    const ev = det.updateFrame(frame(t, left, right, speed), t);
    if (ev) events.push(ev);
  }
  return events;
}

const HANDS_DOWN = -0.8;
const ARM_UP = 1;

describe("RaiseHandDetector", () => {
  it("fires once after a one-second hold with a hand up", () => {
    const det = new RaiseHandDetector();
    hold(det, 0, 200, HANDS_DOWN, HANDS_DOWN);
    expect(hold(det, 200, 900, HANDS_DOWN, ARM_UP)).toEqual([]);
    expect(det.state.hands).toBe("one");
    expect(det.state.progress).toBeGreaterThan(0.8);
    const events = hold(det, 1100, 1000, HANDS_DOWN, ARM_UP);
    expect(events).toHaveLength(1);
    expect(events[0].hands).toBe("one");
  });

  it("needs the hands down first, so a hand already up can't press anything", () => {
    const det = new RaiseHandDetector();
    expect(hold(det, 0, 3000, HANDS_DOWN, ARM_UP)).toEqual([]);
    expect(det.state.progress).toBe(0);
    hold(det, 3000, 100, HANDS_DOWN, HANDS_DOWN);
    expect(hold(det, 3100, 1100, HANDS_DOWN, ARM_UP)).toHaveLength(1);
  });

  it("disarms after reset() until the hands come down", () => {
    const det = new RaiseHandDetector();
    hold(det, 0, 100, HANDS_DOWN, HANDS_DOWN);
    hold(det, 100, 500, HANDS_DOWN, ARM_UP);
    det.reset();
    expect(hold(det, 600, 2000, HANDS_DOWN, ARM_UP)).toEqual([]);
  });

  it("says both when both hands are up, even if one arrived a moment later", () => {
    const det = new RaiseHandDetector();
    hold(det, 0, 100, HANDS_DOWN, HANDS_DOWN);
    hold(det, 100, 100, HANDS_DOWN, ARM_UP);
    const events = hold(det, 200, 1100, ARM_UP, ARM_UP);
    expect(events).toEqual([expect.objectContaining({ hands: "both" })]);
  });

  it("says one if a hand dropped during the hold", () => {
    const det = new RaiseHandDetector();
    hold(det, 0, 100, HANDS_DOWN, HANDS_DOWN);
    hold(det, 100, 500, ARM_UP, ARM_UP);
    expect(hold(det, 600, 600, HANDS_DOWN, ARM_UP)).toEqual([expect.objectContaining({ hands: "one" })]);
  });

  it("ignores a hand at head height (scratching, the top of a throw)", () => {
    const det = new RaiseHandDetector();
    hold(det, 0, 100, HANDS_DOWN, HANDS_DOWN);
    expect(hold(det, 100, 3000, HANDS_DOWN, 0.45)).toEqual([]);
  });

  it("ignores a hand up but waving", () => {
    const det = new RaiseHandDetector();
    hold(det, 0, 100, HANDS_DOWN, HANDS_DOWN);
    expect(hold(det, 100, 3000, HANDS_DOWN, ARM_UP, 3)).toEqual([]);
  });

  it("keeps the hold through a one-frame tracking dropout, but not a real drop", () => {
    const det = new RaiseHandDetector();
    hold(det, 0, 100, HANDS_DOWN, HANDS_DOWN);
    hold(det, 100, 600, HANDS_DOWN, ARM_UP);
    hold(det, 700, FRAME_MS, HANDS_DOWN, null);
    expect(hold(det, 700 + FRAME_MS, 500, HANDS_DOWN, ARM_UP)).toHaveLength(1);

    hold(det, 2000, 100, HANDS_DOWN, HANDS_DOWN);
    hold(det, 2100, 600, HANDS_DOWN, ARM_UP);
    hold(det, 2700, 400, HANDS_DOWN, HANDS_DOWN);
    expect(hold(det, 3100, 500, HANDS_DOWN, ARM_UP)).toEqual([]);
  });
});

describe("RaiseHandDetector — real recordings", () => {
  // None of the recorded throws, waves, head scratches or dribbles is a deliberate raised hand.
  const recordings = (fixture as { recordings: Recording[] }).recordings;

  function replay(rec: Recording) {
    const smoother = new PoseSmoother([...UPPER_BODY, LM.LEFT_INDEX, LM.RIGHT_INDEX], DEFAULT_SMOOTHING);
    const kin = new KinematicsTracker();
    const det = new RaiseHandDetector();
    const events: RaiseHandEvent[] = [];
    for (const f of rec.frames) {
      let pose: NormalizedLandmark[] | undefined;
      if (f.landmarks.length) {
        pose = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
        for (const l of f.landmarks) pose[l.i] = { x: l.x, y: l.y, z: l.z, visibility: l.v };
      }
      const ev = det.updateFrame(kin.update(smoother.apply(pose, f.t), f.t, rec.video.width / rec.video.height, "auto"), f.t);
      if (ev) events.push(ev);
    }
    return events;
  }

  it.each(recordings.map((r, i) => [`${r.label} #${i}`, r] as const))("never fires on %s", (_, rec) => {
    expect(replay(rec)).toEqual([]);
  });
});
