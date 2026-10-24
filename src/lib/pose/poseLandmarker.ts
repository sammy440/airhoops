import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

export type PoseModel = "lite" | "full" | "heavy";
export type Delegate = "GPU" | "CPU";

export interface LoadedLandmarker {
  landmarker: PoseLandmarker;
  delegate: Delegate;
  model: PoseModel;
}

/** Served from /public, copied there by scripts/copy-mediapipe.mjs. */
const WASM_PATH = "/mediapipe/wasm";

const modelUrl = (model: PoseModel) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${model}/float16/latest/pose_landmarker_${model}.task`;

let filesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;

/**
 * Creates a PoseLandmarker in VIDEO mode. Tries the GPU delegate first and
 * falls back to CPU, since WebGL is unavailable or flaky on some devices.
 */
export async function createPoseLandmarker(model: PoseModel = "lite"): Promise<LoadedLandmarker> {
  filesetPromise ??= FilesetResolver.forVisionTasks(WASM_PATH);
  let vision;
  try {
    vision = await filesetPromise;
  } catch (err) {
    filesetPromise = null; // allow a retry
    throw err;
  }

  const create = (delegate: Delegate) =>
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelUrl(model), delegate },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

  try {
    return { landmarker: await create("GPU"), delegate: "GPU", model };
  } catch (gpuErr) {
    console.warn("[pose] GPU delegate failed, falling back to CPU", gpuErr);
    return { landmarker: await create("CPU"), delegate: "CPU", model };
  }
}
