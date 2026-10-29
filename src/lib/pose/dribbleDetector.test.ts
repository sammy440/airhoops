import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import type { Recording } from "@/lib/recorder/recording";
import fixture from "./__fixtures__/recordings.json";
import { DribbleDetector, type BounceEvent } from "./dribbleDetector";
import { KinematicsTracker, type ArmKinematics } from "./kinematics";
import { LM, UPPER_BODY } from "./landmarks";
import { DEFAULT_SMOOTHING, PoseSmoother } from "./oneEuroFilter";
import { ThrowDetector } from "./throwDetector";

const FRAME_MS = 1000 / 30;

const arm = (height: number, vDown: number): ArmKinematics => ({
  side: "right",
  wrist: { x: 0.5, y: 0.5 },
  velocity: { x: 0, y: vDown },
  speed: Math.abs(vDown),
  angle: 0,
  elbowAngle: 120,
  extension: 0.5,
  height,
  belowHip: -0.3,
});

/** Wrist bobbing around `center` (torso lengths vs shoulder) at `hz`, ±`amp`. */
function bob(det: DribbleDetector, { center, amp, hz, seconds, t0 = 0 }: { center: number; amp: number; hz: number; seconds: number; t0?: number }) {
  const events: BounceEvent[] = [];
  const w = 2 * Math.PI * hz;
  for (let t = t0; t < t0 + seconds * 1000; t += FRAME_MS) {
    const s = t / 1000;
    const height = center + amp * Math.cos(w * s);
    const vDown = amp * w * Math.sin(w * s); // height falling = wrist moving down the image
    const ev = det.update(t, arm(height, vDown), "right");
    if (ev) events.push(ev);
  }
  return events;
}

describe("DribbleDetector", () => {
  it("bounces once per pat at the waist and calls it dribbling", () => {
    const det = new DribbleDetector();
    const events = bob(det, { center: -0.7, amp: 0.15, hz: 2, seconds: 3 });
    expect(events.length).toBeGreaterThanOrEqual(5);
    expect(events.length).toBeLessThanOrEqual(6);
    expect(events[0].dribbling).toBe(false);
    expect(events.at(-1)!.dribbling).toBe(true);
    expect(events.at(-1)!.intervalMs).toBeCloseTo(500, -2);
    expect(det.dribbling(3000)).toBe(true);
    expect(det.dribbling(5000)).toBe(false); // stopped
  });

  it("ignores the same motion with the hands up (that's shooting territory)", () => {
    expect(bob(new DribbleDetector(), { center: 0.3, amp: 0.15, hz: 2, seconds: 3 })).toEqual([]);
  });

  it("ignores small jitter at the waist", () => {
    expect(bob(new DribbleDetector(), { center: -0.7, amp: 0.03, hz: 2, seconds: 3 })).toEqual([]);
  });

  it("ignores slow drifting (no push)", () => {
    expect(bob(new DribbleDetector(), { center: -0.7, amp: 0.2, hz: 0.3, seconds: 6 })).toEqual([]);
  });

  it("never fires a shot, even with hard pats", () => {
    const det = new ThrowDetector();
    const w = 2 * Math.PI * 2.5;
    for (let t = 0; t < 4000; t += FRAME_MS) {
      const s = t / 1000;
      const a = arm(-0.6 + 0.25 * Math.cos(w * s), 0.25 * w * Math.sin(w * s));
      expect(det.update(t, { ...a, extension: 0.6 + 0.1 * Math.sin(w * s) }, "right")).toBeNull();
    }
  });

  it("treats both hands patting together as one bounce", () => {
    const det = new DribbleDetector();
    let n = 0;
    for (let i = 0; i < 90; i++) {
      const t = i * FRAME_MS;
      const s = t / 1000;
      const w = 2 * Math.PI * 2;
      const a = arm(-0.7 + 0.15 * Math.cos(w * s), 0.15 * w * Math.sin(w * s));
      if (det.update(t, a, "left")) n++;
      if (det.update(t, a, "right")) n++;
    }
    expect(n).toBeGreaterThanOrEqual(5);
    expect(n).toBeLessThanOrEqual(6);
  });
});

describe("DribbleDetector — real recording", () => {
  // 18 s of patting at the waist with both hands in step, right hand leading: 16 pats ~740 ms apart in the
  // first 12.2 s (counted from the wrist trace: dips of ≥ 0.15 torso), then a looser finish.
  const rec = (fixture as { recordings: Recording[] }).recordings.find((r) => r.label === "dribble")!;
  const PATS_S = [0.86, 1.6, 2.33, 3.06, 3.8, 4.53, 5.33, 6.13, 6.86, 7.53, 8.26, 9.0, 9.73, 10.53, 11.2, 12.06];

  function replay() {
    const smoother = new PoseSmoother([...UPPER_BODY, LM.LEFT_INDEX, LM.RIGHT_INDEX], DEFAULT_SMOOTHING);
    const kin = new KinematicsTracker();
    const dribble = new DribbleDetector();
    const shots = new ThrowDetector();
    const bounces: BounceEvent[] = [];
    let throws = 0;
    for (const f of rec.frames) {
      let pose: NormalizedLandmark[] | undefined;
      if (f.landmarks.length) {
        pose = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
        for (const l of f.landmarks) pose[l.i] = { x: l.x, y: l.y, z: l.z, visibility: l.v };
      }
      const k = kin.update(smoother.apply(pose, f.t), f.t, rec.video.width / rec.video.height, "auto");
      const b = dribble.updateFrame(k, f.t);
      if (b) bounces.push({ ...b, t: b.t - rec.frames[0].t });
      if (shots.updateFrame(k, f.t)) throws++;
    }
    return { bounces, throws };
  }

  it("bounces once per pat while the rhythm is steady", () => {
    const steady = replay().bounces.filter((b) => b.t < 12_200);
    expect(steady.length).toBe(16);
    expect(steady.slice(1).every((b) => b.dribbling)).toBe(true);
    // Each bounce lands on its own pat (the bottom of the wrist's dip), within a quarter of a second.
    steady.forEach((b, i) => expect(Math.abs(b.t - PATS_S[i] * 1000)).toBeLessThan(250));
  });

  it("keeps the ball in one hand when both hands pat together", () => {
    const steady = replay().bounces.filter((b) => b.t < 12_200);
    expect(new Set(steady.map((b) => b.hand))).toEqual(new Set(["right"]));
  });

  it("never fires a shot", () => {
    expect(replay().throws).toBe(0);
  });
});
