import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import { KinematicsTracker } from "./kinematics";
import { framingIssue, LM, trackingConfidence } from "./landmarks";

const ASPECT = 16 / 9;

/** A player facing the camera, in MediaPipe's normalized coords; `hide` landmarks aren't seen. */
function player({ shift = 0, width = 0.2, hide = [] as number[], seen = 0.99 } = {}): NormalizedLandmark[] {
  const p: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }));
  const at = (i: number, x: number, y: number) => (p[i] = { x, y, z: 0, visibility: hide.includes(i) ? 0.05 : seen });
  const cx = 0.5 + shift;
  at(LM.LEFT_SHOULDER, cx - width / 2, 0.4);
  at(LM.RIGHT_SHOULDER, cx + width / 2, 0.4);
  at(LM.LEFT_ELBOW, cx - width / 2 - 0.05, 0.55);
  at(LM.RIGHT_ELBOW, cx + width / 2 + 0.05, 0.55);
  at(LM.LEFT_WRIST, cx - width / 2 - 0.05, 0.7);
  at(LM.RIGHT_WRIST, cx + width / 2 + 0.05, 0.7);
  at(LM.LEFT_HIP, 0.5 - width * 0.4, 0.75);
  at(LM.RIGHT_HIP, 0.5 + width * 0.4, 0.75);
  return p;
}
const HIPS = [LM.LEFT_HIP, LM.RIGHT_HIP];
const LEFT_ARM = [LM.LEFT_ELBOW, LM.LEFT_WRIST];

describe("framing for seated and one-armed players", () => {
  it("standing: hidden hips mean step back (unchanged)", () => {
    expect(framingIssue(player())).toBeNull();
    expect(framingIssue(player({ hide: HIPS }))).toBe("too_close");
  });

  it("seated: hips behind a desk are fine, and size comes from the shoulders", () => {
    expect(framingIssue(player({ hide: HIPS }), { seated: true })).toBeNull();
    expect(framingIssue(player({ hide: HIPS, width: 0.5 }), { seated: true })).toBe("too_close");
    expect(framingIssue(player({ hide: HIPS, width: 0.05 }), { seated: true })).toBe("too_far");
    expect(framingIssue(player({ hide: HIPS, shift: 0.3 }), { seated: true })).toBe("off_center");
    // Hips in view: the usual torso check still applies
    expect(framingIssue(player(), { seated: true })).toBeNull();
  });

  it("one arm: the arm that isn't there doesn't count against tracking", () => {
    // In ordinary room light (landmarks seen at 0.7), the missing arm drags tracking under the bar
    const dim = player({ hide: LEFT_ARM, seen: 0.7 });
    expect(framingIssue(dim)).toBe("low_visibility");
    expect(framingIssue(dim, { oneArm: true })).toBeNull();
    expect(trackingConfidence(dim, { oneArm: true })).toBeCloseTo(0.7, 5);
    // Both: seated, one arm, hips hidden
    expect(framingIssue(player({ hide: [...LEFT_ARM, ...HIPS] }), { seated: true, oneArm: true })).toBeNull();
  });
});

describe("aim (lean) when seated", () => {
  const lean = (k: KinematicsTracker, pose: NormalizedLandmark[], t: number) => k.update(pose, t, ASPECT)!.lean;

  it("is unchanged with the hips in view", () => {
    const a = new KinematicsTracker();
    const b = new KinematicsTracker();
    b.setSeated(true);
    expect(lean(b, player({ shift: 0.03 }), 0)).toBeCloseTo(lean(a, player({ shift: 0.03 }), 0)!, 9);
  });

  it("standing, hidden hips give no aim; seated, it's measured from where the hips were", () => {
    const standing = new KinematicsTracker();
    expect(lean(standing, player({ shift: 0.03, hide: HIPS }), 0)).toBeNull();
    const seated = new KinematicsTracker();
    seated.setSeated(true);
    const seen = lean(seated, player({ shift: 0.03 }), 0)!;
    // Hips go behind the desk: the same lean still reads the same
    expect(lean(seated, player({ shift: 0.03, hide: HIPS }), 33)).toBeCloseTo(seen, 2);
    // Leaning the other way reads the other way
    expect(lean(seated, player({ shift: -0.03, hide: HIPS }), 66)).toBeLessThan(0);
  });

  it("seated with the hips never seen: from the middle of the frame", () => {
    const k = new KinematicsTracker();
    k.setSeated(true);
    expect(lean(k, player({ shift: 0.04, hide: HIPS }), 0)).toBeGreaterThan(0);
    expect(lean(k, player({ shift: -0.04, hide: HIPS }), 33)).toBeLessThan(0);
  });
});
