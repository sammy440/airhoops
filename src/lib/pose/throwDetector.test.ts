import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import type { Recording } from "@/lib/recorder/recording";
import expected from "./__fixtures__/expected-events.json";
import fixture from "./__fixtures__/recordings.json";
import { KinematicsTracker, type ArmKinematics } from "./kinematics";
import { LM, UPPER_BODY } from "./landmarks";
import { DEFAULT_SMOOTHING, PoseSmoother } from "./oneEuroFilter";
import { DEFAULT_THROW_PARAMS, ThrowDetector, type ThrowEvent } from "./throwDetector";

const SMOOTHED = [...UPPER_BODY, LM.LEFT_INDEX, LM.RIGHT_INDEX];

/** Rebuilds 33-landmark poses from a recording and runs the full browser pipeline. */
function replay(rec: Recording) {
  const smoother = new PoseSmoother(SMOOTHED, DEFAULT_SMOOTHING);
  const kin = new KinematicsTracker();
  const det = new ThrowDetector();
  const aspect = rec.video.width / rec.video.height;
  const events: ThrowEvent[] = [];
  const states: string[] = [];
  for (const f of rec.frames) {
    let pose: NormalizedLandmark[] | undefined;
    if (f.landmarks.length) {
      pose = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
      for (const l of f.landmarks) pose[l.i] = { x: l.x, y: l.y, z: l.z, visibility: l.v };
    }
    const k = kin.update(smoother.apply(pose, f.t), f.t, aspect, rec.hand);
    const ev = det.updateFrame(k, f.t);
    if (ev) events.push(ev);
    states.push(det.state);
  }
  return { events, states };
}

const recordings = (fixture as { recordings: Recording[] }).recordings;

describe("ThrowDetector — replay of real recordings", () => {
  it("uses the same parameters as the Python lab", () => {
    expect(DEFAULT_THROW_PARAMS).toEqual(expected.params);
  });

  for (const clip of expected.clips) {
    const rec = recordings.find((r) => r.id === clip.id)!;

    it(`matches Python events for ${clip.label} clip ${clip.id.slice(0, 8)} (${clip.hand} hand)`, () => {
      const { events } = replay(rec);
      expect(events.length).toBe(clip.events.length);
      events.forEach((e, i) => {
        const x = clip.events[i];
        expect(e.t).toBe(x.t);
        expect(e.hand).toBe(x.hand);
        expect(e.pickedUp).toBe(x.pickedUp);
        for (const key of ["power", "angle", "arc", "peakSpeed", "extension", "height", "durationMs"] as const) {
          expect(e[key]).toBeCloseTo(x[key], 6);
        }
      });
    });

    if (clip.label === "throw") {
      it(`detects the throw in clip ${clip.id.slice(0, 8)}`, () => {
        expect(replay(rec).events.length).toBeGreaterThanOrEqual(1);
      });
    }
  }
});

describe("ThrowDetector — behaviour", () => {
  const arm = (o: Partial<ArmKinematics>): ArmKinematics => ({
    side: "right",
    wrist: { x: 0.5, y: 0.5 },
    velocity: { x: 0, y: 0 },
    speed: 0,
    angle: 0,
    elbowAngle: 120,
    extension: 0.45,
    height: 0.2,
    belowHip: -1,
    ...o,
  });

  /** A clean shot: hand settles (set point), then extends 0.45 → 0.85 upward and retracts. */
  function cleanThrow(det: ThrowDetector, t0: number) {
    const frames: Partial<ArmKinematics>[] = [
      { speed: 0.2, extension: 0.45 },
      { speed: 0.3, extension: 0.45 },
      { speed: 0.3, extension: 0.45 },
      { speed: 2.5, extension: 0.55, velocity: { x: 1.5, y: -2 } },
      { speed: 4.0, extension: 0.7, velocity: { x: 2.5, y: -3 } },
      { speed: 3.5, extension: 0.85, velocity: { x: 2, y: -2.8 }, height: 0.5 },
      { speed: 1.2, extension: 0.78, velocity: { x: 0.5, y: -1 } },
    ];
    let ev: ThrowEvent | null = null;
    frames.forEach((f, i) => (ev = det.update(t0 + i * 50, arm(f), "right") ?? ev));
    return ev as ThrowEvent | null;
  }

  it("emits one event with power, angle and arc for a clean throw", () => {
    const det = new ThrowDetector();
    const ev = cleanThrow(det, 0)!;
    expect(ev).not.toBeNull();
    const { powerMinSpeed: lo, powerMaxSpeed: hi } = DEFAULT_THROW_PARAMS;
    expect(ev.power).toBeCloseTo((4 - lo) / (hi - lo), 6);
    expect(ev.angle).toBeGreaterThan(40);
    expect(ev.arc).toBeCloseTo(0.7 / 1.2, 6);
    expect(det.state).toBe("COOLDOWN");
  });

  it("ignores a second throw during cooldown, accepts one after", () => {
    const det = new ThrowDetector();
    expect(cleanThrow(det, 0)).not.toBeNull();
    expect(cleanThrow(det, 300)).toBeNull();
    expect(cleanThrow(det, 2000)).not.toBeNull();
  });

  it("rejects fast motion that never extends the arm (e.g. a wave)", () => {
    const det = new ThrowDetector();
    for (let i = 0; i < 30; i++) {
      const ev = det.update(i * 33, arm({ speed: 3, extension: 0.5 + Math.sin(i) * 0.02, velocity: { x: 3, y: 0 } }), "right");
      expect(ev).toBeNull();
    }
  });

  it("never starts a throw from continuous motion (waving has no set point)", () => {
    const det = new ThrowDetector();
    for (let i = 0; i < 40; i++) {
      const extension = 0.5 + 0.35 * Math.abs(Math.sin(i / 3));
      const ev = det.update(i * 50, arm({ speed: 3.5, extension, height: 0.7, velocity: { x: 1, y: -3 } }), "right");
      expect(ev).toBeNull();
    }
  });

  it("rejects a sideways swipe even from a set point", () => {
    const det = new ThrowDetector();
    const frames: Partial<ArmKinematics>[] = [
      { speed: 0.2 },
      { speed: 0.2 },
      { speed: 0.2 },
      { speed: 2.5, extension: 0.55, velocity: { x: 3, y: 0.1 } },
      { speed: 4.0, extension: 0.7, velocity: { x: 4, y: 0.1 } },
      { speed: 3.5, extension: 0.85, velocity: { x: 3.5, y: 0 }, height: 0.6 },
      { speed: 1.0, extension: 0.78, velocity: { x: 1, y: 0 } },
    ];
    expect(frames.every((f, i) => det.update(i * 50, arm(f), "right") === null)).toBe(true);
  });

  it("rejects throws released below shoulder height", () => {
    const det = new ThrowDetector();
    const frames = [0.45, 0.55, 0.7, 0.85, 0.78].map((extension, i) =>
      det.update(i * 50, arm({ speed: i ? 3 : 0.3, extension, height: -0.6 }), "right"),
    );
    expect(frames.every((e) => e === null)).toBe(true);
  });

  it("times out to IDLE if the throw never resolves", () => {
    const det = new ThrowDetector();
    for (let i = 0; i < 40; i++) det.update(i * 33, arm({ speed: 2 + i * 0.1, extension: 0.4 + i * 0.01 }), "right");
    expect(det.state).toBe("IDLE");
  });

  it("returns to IDLE when the arm is lost mid-throw", () => {
    const det = new ThrowDetector();
    det.update(0, arm({ speed: 0.3 }), "right");
    det.update(50, arm({ speed: 0.3 }), "right");
    det.update(100, arm({ speed: 3, extension: 0.6 }), "right");
    expect(det.state).toBe("THROW");
    det.update(150, null, "right");
    expect(det.state).toBe("IDLE");
  });

  it("reports PICKUP when the wrist is near the hip", () => {
    const det = new ThrowDetector();
    det.update(0, arm({ belowHip: 0.1, height: -1.2 }), "right");
    expect(det.state).toBe("PICKUP");
  });
});
