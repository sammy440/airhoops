"use client";

import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useCamera } from "@/hooks/useCamera";
import { usePoseTracking, type PoseFrame } from "@/hooks/usePoseTracking";
import { KinematicsTracker, type KinematicsFrame, type Side } from "@/lib/pose/kinematics";
import { LM, UPPER_BODY } from "@/lib/pose/landmarks";
import { DEFAULT_SMOOTHING, PoseSmoother } from "@/lib/pose/oneEuroFilter";
import { DEFAULT_THROW_PARAMS, ThrowDetector, type DetectorState, type ThrowEvent } from "@/lib/pose/throwDetector";

const SMOOTHED = [...UPPER_BODY, LM.LEFT_INDEX, LM.RIGHT_INDEX];
const PEAK_WINDOW_MS = 1500;
/** Plenty for pose (the model runs at 256 px) and much cheaper to decode than 720p. */
const GAME_RESOLUTION = { width: 640, height: 360 };

/** Throwing-arm numbers for the HUD, refreshed at 10 Hz. */
export interface MotionReadout {
  hand: Side;
  speed: number;
  peak: number;
  angle: number;
  extension: number;
  height: number;
}
const LAB_PREFS_KEY = "airhoops.lab.prefs";

/** Reuse thresholds tuned in /lab, so the game feels the same as the lab. */
function labThrowParams() {
  try {
    const prefs = JSON.parse(localStorage.getItem(LAB_PREFS_KEY) ?? "{}");
    return { ...DEFAULT_THROW_PARAMS, ...(prefs.throwParams ?? {}) };
  } catch {
    return DEFAULT_THROW_PARAMS;
  }
}

/**
 * Camera → pose → One Euro → kinematics → throw detector, packaged for the
 * game. Per-frame data flows through callbacks (no React re-render);
 * the detector state is published at 10 Hz for UI.
 */
export function useThrowInput(
  videoRef: RefObject<HTMLVideoElement | null>,
  {
    enabled,
    onThrow,
    onPose,
  }: {
    enabled: boolean;
    onThrow: (ev: ThrowEvent) => void;
    /** Smoothed pose + kinematics every frame (for the avatar and the camera preview) */
    onPose?: (smoothed: NormalizedLandmark[] | undefined, kin: KinematicsFrame | null) => void;
  },
) {
  const { state: cam, retry } = useCamera(videoRef, undefined, enabled, GAME_RESOLUTION);
  const live = cam.status === "live";

  const [pipeline] = useState(() => ({
    smoother: new PoseSmoother(SMOOTHED, DEFAULT_SMOOTHING),
    kin: new KinematicsTracker(),
    detector: new ThrowDetector(),
  }));
  const camRef = useRef({ width: 1280, height: 720 });
  const kinRef = useRef<KinematicsFrame | null>(null);
  const speedsRef = useRef<{ t: number; v: number }[]>([]);
  const cbRef = useRef({ onThrow, onPose });
  useEffect(() => {
    cbRef.current = { onThrow, onPose };
  }, [onThrow, onPose]);
  useEffect(() => {
    if (live) camRef.current = { width: cam.width, height: cam.height };
  }, [live, cam]);
  useEffect(() => {
    pipeline.detector.setParams(labThrowParams());
  }, [pipeline]);

  const onFrame = useCallback(
    ({ pose, t }: PoseFrame) => {
      const { width, height } = camRef.current;
      const smoothed = pipeline.smoother.apply(pose, t);
      const kin = pipeline.kin.update(smoothed, t, width / height, "auto");
      const ev = pipeline.detector.updateFrame(kin, t);
      kinRef.current = kin;
      const speeds = speedsRef.current;
      speeds.push({ t, v: kin?.arms[kin.hand]?.speed ?? 0 });
      while (speeds.length && t - speeds[0].t > PEAK_WINDOW_MS) speeds.shift();
      cbRef.current.onPose?.(smoothed, kin);
      if (ev) cbRef.current.onThrow(ev);
    },
    [pipeline],
  );

  const { state: tracker, stats, retry: retryTracker } = usePoseTracking(videoRef, { enabled: live, model: "lite", onFrame });

  const [detectorState, setDetectorState] = useState<DetectorState>("IDLE");
  const [motion, setMotion] = useState<MotionReadout | null>(null);
  useEffect(() => {
    if (tracker.status !== "ready") return;
    const id = window.setInterval(() => {
      setDetectorState(pipeline.detector.state);
      const kin = kinRef.current;
      const arm = kin?.arms[kin.hand];
      setMotion(
        kin && arm
          ? {
              hand: kin.hand,
              speed: arm.speed,
              peak: Math.max(0, ...speedsRef.current.map((s) => s.v)),
              angle: arm.angle,
              extension: arm.extension,
              height: arm.height,
            }
          : null,
      );
    }, 100);
    return () => window.clearInterval(id);
  }, [tracker.status, pipeline]);

  return { cam, tracker, stats, detectorState, motion, thresholds: pipeline.detector.params, retry, retryTracker };
}
