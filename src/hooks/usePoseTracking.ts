"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { NormalizedLandmark, PoseLandmarker } from "@mediapipe/tasks-vision";
import { createPoseLandmarker, type Delegate, type PoseModel } from "@/lib/pose/poseLandmarker";
import { framingIssue, trackingConfidence, type FramingIssue } from "@/lib/pose/landmarks";

export interface PoseFrame {
  pose: NormalizedLandmark[] | undefined;
  /** performance.now() timestamp of the frame */
  t: number;
}

export interface TrackingStats {
  fps: number;
  inferenceMs: number;
  confidence: number;
  framing: FramingIssue | null;
}

export type TrackerState =
  | { status: "idle" }
  | { status: "loading"; model: PoseModel }
  | { status: "ready"; model: PoseModel; delegate: Delegate }
  | { status: "error"; detail: string };

const STATS_INTERVAL_MS = 250;

/**
 * Runs MediaPipe Pose on every new video frame. Per-frame data is delivered
 * through `onFrame` (no React re-render); summary stats update ~4x a second.
 */
export function usePoseTracking(
  videoRef: RefObject<HTMLVideoElement | null>,
  { enabled, model, onFrame }: { enabled: boolean; model: PoseModel; onFrame?: (frame: PoseFrame) => void },
) {
  const [attempt, setAttempt] = useState(0);
  // Outcome of the most recent load, tagged with the request it belongs to.
  const [loaded, setLoaded] = useState<{ key: string; state: TrackerState } | null>(null);
  const [stats, setStats] = useState<TrackingStats>({ fps: 0, inferenceMs: 0, confidence: 0, framing: "no_person" });
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const onFrameRef = useRef(onFrame);
  const latestRef = useRef<PoseFrame>({ pose: undefined, t: 0 });

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const loadKey = `${model}:${attempt}`;
  const state: TrackerState = !enabled
    ? { status: "idle" }
    : loaded?.key === loadKey
      ? loaded.state
      : { status: "loading", model };

  // Load (or reload on model change) the landmarker.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const key = `${model}:${attempt}`;
    createPoseLandmarker(model)
      .then(({ landmarker, delegate }) => {
        if (cancelled) return landmarker.close();
        landmarkerRef.current = landmarker;
        setLoaded({ key, state: { status: "ready", model, delegate } });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoaded({ key, state: { status: "error", detail: err instanceof Error ? err.message : String(err) } });
      });
    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, [enabled, model, attempt]);

  const ready = state.status === "ready";
  useEffect(() => {
    const video = videoRef.current;
    if (!ready || !video) return;

    let handle = 0;
    let stopped = false;
    let lastTs = -1;
    let frames = 0;
    let inferSum = 0;
    let windowStart = performance.now();
    const useRVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype;

    const schedule = () => {
      if (stopped) return;
      handle = useRVFC ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
    };

    const tick = () => {
      const landmarker = landmarkerRef.current;
      if (!landmarker || video.readyState < 2 || document.hidden) return schedule();

      // detectForVideo requires strictly increasing timestamps.
      const now = performance.now();
      const ts = now <= lastTs ? lastTs + 1 : now;
      lastTs = ts;

      try {
        const t0 = performance.now();
        const result = landmarker.detectForVideo(video, ts);
        inferSum += performance.now() - t0;
        frames++;
        const frame = { pose: result.landmarks[0], t: ts };
        latestRef.current = frame;
        onFrameRef.current?.(frame);
      } catch (err) {
        console.error("[pose] detect failed", err);
      }

      const elapsed = now - windowStart;
      if (elapsed >= STATS_INTERVAL_MS) {
        const pose = latestRef.current.pose;
        setStats({
          fps: (frames * 1000) / elapsed,
          inferenceMs: frames ? inferSum / frames : 0,
          confidence: trackingConfidence(pose),
          framing: framingIssue(pose),
        });
        frames = 0;
        inferSum = 0;
        windowStart = now;
      }
      schedule();
    };

    schedule();
    return () => {
      stopped = true;
      if (useRVFC) video.cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
    };
  }, [ready, videoRef]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, stats, latestRef, retry };
}
