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

/** Mean visibility (0..1) of the upper-body landmarks. */
export function trackingConfidence(pose: NormalizedLandmark[] | undefined) {
  if (!pose) return 0;
  let sum = 0;
  for (const i of UPPER_BODY) sum += visibilityOf(pose[i]);
  return sum / UPPER_BODY.length;
}

export type FramingIssue = "no_person" | "too_close" | "too_far" | "off_center" | "low_visibility";

/**
 * Quick framing check so the UI can coach the player into position.
 * Thresholds are deliberately loose; they get tuned in Week 5.
 */
export function framingIssue(pose: NormalizedLandmark[] | undefined): FramingIssue | null {
  if (!pose) return "no_person";
  const ls = pose[LM.LEFT_SHOULDER];
  const rs = pose[LM.RIGHT_SHOULDER];
  if (trackingConfidence(pose) < 0.55) return "low_visibility";
  const shoulderWidth = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  if (shoulderWidth > 0.42) return "too_close";
  if (shoulderWidth < 0.1) return "too_far";
  const centerX = (ls.x + rs.x) / 2;
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
