import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { Side } from "@/lib/pose/kinematics";
import type { PoseModel } from "@/lib/pose/poseLandmarker";

/** Throws vs. look-alike non-throws. */
export const RECORD_LABELS = ["throw", "wave", "scratch_head", "idle", "catch"] as const;
export type RecordLabel = (typeof RECORD_LABELS)[number];

export const LABEL_INFO: Record<RecordLabel, { name: string; hint: string; isThrow: boolean }> = {
  throw: { name: "Throw", hint: "Scoop, wind up, release toward the screen", isThrow: true },
  wave: { name: "Wave", hint: "Wave hello, fast and slow", isThrow: false },
  scratch_head: { name: "Scratch head", hint: "Raise a hand to your head", isThrow: false },
  idle: { name: "Idle", hint: "Stand naturally, small fidgets", isThrow: false },
  catch: { name: "Catch", hint: "Reach out and catch an imaginary pass", isThrow: false },
};

/** Target per session: ~20 throws and ~20 non-throws. */
export const TARGET_THROWS = 20;
export const TARGET_NON_THROWS = 20;

/** Shoulders, elbows, wrists, index fingers, hips: everything kinematics needs. */
export const RECORDED_LANDMARKS = [11, 12, 13, 14, 15, 16, 19, 20, 23, 24] as const;

export interface RecordedLandmark {
  i: number;
  x: number;
  y: number;
  z: number;
  v: number;
}

export interface RecordedFrame {
  /** ms since recording start */
  t: number;
  /** Empty when no person was detected in this frame */
  landmarks: RecordedLandmark[];
}

/** Schema v1 plus metadata the Python lab needs. */
export interface Recording {
  version: 1;
  id: string;
  label: RecordLabel;
  hand: Side;
  fps: number;
  createdAt: string;
  durationMs: number;
  /** Frame size, so x/y can be converted to square units (aspect = width/height) */
  video: { width: number; height: number };
  model: PoseModel;
  frames: RecordedFrame[];
}

const round = (n: number, dp = 4) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Raw (unsmoothed) landmarks, so smoothing can be re-tuned offline. */
export function toRecordedFrame(pose: NormalizedLandmark[] | undefined, tSinceStart: number): RecordedFrame {
  const landmarks: RecordedLandmark[] = [];
  if (pose) {
    for (const i of RECORDED_LANDMARKS) {
      const lm = pose[i];
      if (!lm) continue;
      landmarks.push({ i, x: round(lm.x), y: round(lm.y), z: round(lm.z), v: round(lm.visibility ?? 0, 3) });
    }
  }
  return { t: Math.round(tSinceStart), landmarks };
}

export function buildRecording(args: {
  label: RecordLabel;
  hand: Side;
  frames: RecordedFrame[];
  video: { width: number; height: number };
  model: PoseModel;
  now?: Date;
}): Recording {
  const { frames } = args;
  const durationMs = frames.length ? frames[frames.length - 1].t : 0;
  const fps = durationMs > 0 ? round(((frames.length - 1) * 1000) / durationMs, 1) : 0;
  return {
    version: 1,
    id: crypto.randomUUID(),
    label: args.label,
    hand: args.hand,
    fps,
    createdAt: (args.now ?? new Date()).toISOString(),
    durationMs,
    video: args.video,
    model: args.model,
    frames,
  };
}

/** e.g. throw_2026-10-24_09-41-07_3fa2.json */
export function recordingFilename(r: Recording) {
  const stamp = r.createdAt.slice(0, 19).replace("T", "_").replace(/:/g, "-");
  return `${r.label}_${stamp}_${r.id.slice(0, 4)}.json`;
}

export function countByLabel(recordings: Recording[]) {
  const counts = Object.fromEntries(RECORD_LABELS.map((l) => [l, 0])) as Record<RecordLabel, number>;
  for (const r of recordings) counts[r.label]++;
  return counts;
}
