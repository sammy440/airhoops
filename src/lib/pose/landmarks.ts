import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

/** MediaPipe Pose landmark indices that AirHoops cares about. */
export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
} as const;

/** Landmarks that must be visible for throw tracking to work well. */
export const UPPER_BODY = [
  LM.LEFT_SHOULDER,
  LM.RIGHT_SHOULDER,
  LM.LEFT_ELBOW,
  LM.RIGHT_ELBOW,
  LM.LEFT_WRIST,
  LM.RIGHT_WRIST,
  LM.LEFT_HIP,
  LM.RIGHT_HIP,
] as const;

export const WRISTS = [LM.LEFT_WRIST, LM.RIGHT_WRIST] as const;

/** Skeleton bones drawn on the overlay, grouped so arms can be highlighted. */
export const BONES = {
  torso: [
    [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
    [LM.LEFT_SHOULDER, LM.LEFT_HIP],
    [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
    [LM.LEFT_HIP, LM.RIGHT_HIP],
  ],
  arms: [
    [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
    [LM.LEFT_ELBOW, LM.LEFT_WRIST],
    [LM.LEFT_WRIST, LM.LEFT_INDEX],
    [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
    [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
    [LM.RIGHT_WRIST, LM.RIGHT_INDEX],
  ],
  legs: [
    [23, 25],
    [25, 27],
    [24, 26],
    [26, 28],
  ],
} as const satisfies Record<string, ReadonlyArray<readonly [number, number]>>;

export const visibilityOf = (lm: NormalizedLandmark | undefined) =>
  lm?.visibility ?? 0;

/**
 * How the player plays, for the framing check. `seated`: at a desk or in a chair, hips often hidden;
 * `oneArm`: one arm throws, the other may not be there to see.
 */
export interface BodyOptions {
  seated?: boolean;
  oneArm?: boolean;
}

const mean = (pose: NormalizedLandmark[], ids: readonly number[]) => ids.reduce((s, i) => s + visibilityOf(pose[i]), 0) / ids.length;

/** Mean visibility (0..1) of the upper-body landmarks that should be in view (see BodyOptions). */
export function trackingConfidence(pose: NormalizedLandmark[] | undefined, o: BodyOptions = {}) {
  if (!pose) return 0;
  if (!o.seated && !o.oneArm) return mean(pose, UPPER_BODY);
  const left = [LM.LEFT_ELBOW, LM.LEFT_WRIST];
  const right = [LM.RIGHT_ELBOW, LM.RIGHT_WRIST];
  // One arm: the better-seen arm stands for both
  const arms = o.oneArm ? (mean(pose, left) >= mean(pose, right) ? [...left, ...left] : [...right, ...right]) : [...left, ...right];
  return mean(pose, [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, ...arms, ...(o.seated ? [] : [LM.LEFT_HIP, LM.RIGHT_HIP])]);
}

/** Seated with the hips out of view, size comes from the shoulders (image width apart). */
const SEATED_SHOULDERS = { min: 0.08, max: 0.42 };

export type FramingIssue = "no_person" | "too_close" | "too_far" | "off_center" | "low_visibility";

/**
 * Quick framing check so the UI can coach the player into position.
 * Uses torso length (shoulders → hips), which stays stable when the player
 * turns side-on; shoulder width does not.
 */
export function framingIssue(pose: NormalizedLandmark[] | undefined, o: BodyOptions = {}): FramingIssue | null {
  if (!pose) return "no_person";
  const ls = pose[LM.LEFT_SHOULDER];
  const rs = pose[LM.RIGHT_SHOULDER];
  if (trackingConfidence(pose, o) < 0.55) return "low_visibility";
  const lh = pose[LM.LEFT_HIP];
  const rh = pose[LM.RIGHT_HIP];
  const centerX = (ls.x + rs.x) / 2;
  if (visibilityOf(lh) < 0.5 || visibilityOf(rh) < 0.5) {
    // Standing, hips out of view means the player is too close. Seated, they're behind the desk: go by the shoulders.
    if (!o.seated) return "too_close";
    const shoulders = Math.abs(ls.x - rs.x);
    if (shoulders > SEATED_SHOULDERS.max) return "too_close";
    if (shoulders < SEATED_SHOULDERS.min) return "too_far";
    return centerX < 0.25 || centerX > 0.75 ? "off_center" : null;
  }
  const torso = Math.hypot((ls.x + rs.x - lh.x - rh.x) / 2, (ls.y + rs.y - lh.y - rh.y) / 2);
  if (torso > 0.5) return "too_close";
  if (torso < 0.15) return "too_far";
  if (centerX < 0.25 || centerX > 0.75) return "off_center";
  return null;
}

export const FRAMING_MESSAGES: Record<FramingIssue, string> = {
  no_person: "Step into view",
  too_close: "Step back a little",
  too_far: "Come a bit closer",
  off_center: "Move to the center",
  low_visibility: "Show your full upper body & improve lighting",
};
