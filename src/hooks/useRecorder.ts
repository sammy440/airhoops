"use client";

import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useRef, useState } from "react";
import { beep } from "@/lib/browser";
import type { Side } from "@/lib/pose/kinematics";
import type { PoseModel } from "@/lib/pose/poseLandmarker";
import { buildRecording, toRecordedFrame, type RecordedFrame, type RecordLabel, type Recording } from "@/lib/recorder/recording";
import { clearRecordings, deleteRecording, listRecordings, saveRecording } from "@/lib/recorder/store";

export type RecorderPhase =
  | { kind: "idle" }
  | { kind: "countdown"; label: RecordLabel; endsAt: number }
  | { kind: "recording"; label: RecordLabel; startedAt: number };

export interface RecorderSettings {
  countdownSec: number;
  /** Auto-stop after this many seconds; null = stop manually */
  durationSec: number | null;
}

export interface RecorderMeta {
  video: { width: number; height: number };
  model: PoseModel;
  hand: Side;
}

/** Clips shorter than this are almost certainly accidental. */
const MIN_FRAMES = 8;

/**
 * Hands-free landmark recorder: countdown with beeps → record → auto-stop →
 * saved to IndexedDB. Frames are pushed from the pose loop via `push`
 * (no re-render per frame). Only numbers are stored, never video.
 */
export function useRecorder(getMeta: () => RecorderMeta) {
  const [phase, setPhaseState] = useState<RecorderPhase>({ kind: "idle" });
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [error, setError] = useState<string | null>(null);

  const phaseRef = useRef<RecorderPhase>(phase);
  const framesRef = useRef<RecordedFrame[]>([]);
  const t0Ref = useRef<number | null>(null);
  const durationRef = useRef<number | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const getMetaRef = useRef(getMeta);

  useEffect(() => {
    getMetaRef.current = getMeta;
  }, [getMeta]);

  const setPhase = useCallback((p: RecorderPhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  useEffect(() => {
    listRecordings()
      .then(setRecordings)
      .catch(() => setError("Couldn't open saved recordings (private browsing?). New clips still download."));
    return () => window.clearInterval(timerRef.current);
  }, []);

  const begin = useCallback(
    (label: RecordLabel) => {
      framesRef.current = [];
      t0Ref.current = null;
      setPhase({ kind: "recording", label, startedAt: performance.now() });
      beep(1320, 220);
    },
    [setPhase],
  );

  const start = useCallback(
    (label: RecordLabel, settings: RecorderSettings) => {
      if (phaseRef.current.kind !== "idle") return;
      setError(null);
      durationRef.current = settings.durationSec;
      if (settings.countdownSec <= 0) return begin(label);

      const endsAt = performance.now() + settings.countdownSec * 1000;
      setPhase({ kind: "countdown", label, endsAt });
      let lastWhole = settings.countdownSec;
      beep(880);
      timerRef.current = window.setInterval(() => {
        const left = endsAt - performance.now();
        if (left <= 0) {
          window.clearInterval(timerRef.current);
          begin(label);
        } else if (Math.ceil(left / 1000) < lastWhole) {
          lastWhole = Math.ceil(left / 1000);
          beep(880);
        }
      }, 50);
    },
    [begin, setPhase],
  );

  const stop = useCallback(async () => {
    const p = phaseRef.current;
    window.clearInterval(timerRef.current);
    if (p.kind === "countdown") return setPhase({ kind: "idle" });
    if (p.kind !== "recording") return;
    setPhase({ kind: "idle" });
    beep(660, 220);

    const frames = framesRef.current;
    framesRef.current = [];
    if (frames.filter((f) => f.landmarks.length).length < MIN_FRAMES) {
      setError("Clip too short or no one in frame, so it wasn't saved.");
      return;
    }
    const rec = buildRecording({ label: p.label, frames, ...getMetaRef.current() });
    setRecordings((rs) => [rec, ...rs]);
    try {
      await saveRecording(rec);
    } catch {
      setError("Saved for this session only (storage unavailable). Download it to keep it.");
    }
  }, [setPhase]);

  /** Called from the pose loop with the raw (unsmoothed) pose. */
  const push = useCallback(
    (pose: NormalizedLandmark[] | undefined, t: number) => {
      if (phaseRef.current.kind !== "recording") return;
      t0Ref.current ??= t;
      const elapsed = t - t0Ref.current;
      framesRef.current.push(toRecordedFrame(pose, elapsed));
      if (durationRef.current && elapsed >= durationRef.current * 1000) void stop();
    },
    [stop],
  );

  const remove = useCallback(async (id: string) => {
    setRecordings((rs) => rs.filter((r) => r.id !== id));
    await deleteRecording(id).catch(() => {});
  }, []);

  const clearAll = useCallback(async () => {
    setRecordings([]);
    await clearRecordings().catch(() => {});
  }, []);

  return { phase, recordings, error, start, stop, push, remove, clearAll };
}
