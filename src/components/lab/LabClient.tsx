"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCamera } from "@/hooks/useCamera";
import { usePoseTracking, type PoseFrame } from "@/hooks/usePoseTracking";
import { useRecorder, type RecorderPhase } from "@/hooks/useRecorder";
import { KinematicsTracker, type HandChoice, type KinematicsFrame } from "@/lib/pose/kinematics";
import { FRAMING_MESSAGES, LM, UPPER_BODY } from "@/lib/pose/landmarks";
import { DEFAULT_SMOOTHING, PoseSmoother } from "@/lib/pose/oneEuroFilter";
import { DEFAULT_THROW_PARAMS, ThrowDetector, type DetectorState, type ThrowEvent, type ThrowParams } from "@/lib/pose/throwDetector";
import { beep } from "@/lib/browser";
import type { PoseModel } from "@/lib/pose/poseLandmarker";
import { LABEL_INFO, RECORD_LABELS, type RecordLabel, type Recording } from "@/lib/recorder/recording";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { CameraFeed } from "./CameraFeed";
import { CameraError } from "./CameraError";
import { DetectorPanel } from "./DetectorPanel";
import { Panel, Segmented, Slider, Stat, Toggle } from "./Controls";
import { KinematicsPanel } from "./KinematicsPanel";
import { RecorderPanel } from "./RecorderPanel";
import { SkeletonOverlay, type SkeletonOverlayHandle } from "./SkeletonOverlay";
import type { SpeedGraphHandle } from "./SpeedGraph";

const MODELS: { value: PoseModel; label: string; hint: string }[] = [
  { value: "lite", label: "Lite", hint: "Fastest. Best for laptops and phones." },
  { value: "full", label: "Full", hint: "Balanced accuracy and speed." },
  { value: "heavy", label: "Heavy", hint: "Most accurate. Needs a strong GPU." },
];

/** Landmarks the One Euro filter runs on (arms, shoulders, hips, fingers). */
const SMOOTHED = [...UPPER_BODY, LM.LEFT_INDEX, LM.RIGHT_INDEX];

const PREFS_KEY = "airhoops.lab.prefs";
const KIN_UI_INTERVAL_MS = 100;

interface Prefs {
  model: PoseModel;
  mirrored: boolean;
  showVideo: boolean;
  showSkeleton: boolean;
  showLegs: boolean;
  deviceId?: string;
  hand: HandChoice;
  smoothing: boolean;
  minCutoff: number;
  beta: number;
  showVector: boolean;
  compareRaw: boolean;
  label: RecordLabel;
  countdownSec: number;
  durationSec: number | null;
  /** Live overrides of the detector thresholds */
  throwParams: Partial<ThrowParams>;
  throwSound: boolean;
}

const DEFAULT_PREFS: Prefs = {
  model: "lite",
  mirrored: true,
  showVideo: true,
  showSkeleton: true,
  showLegs: false,
  hand: "auto",
  smoothing: true,
  ...DEFAULT_SMOOTHING,
  showVector: true,
  compareRaw: false,
  label: "throw",
  countdownSec: 3,
  durationSec: 3,
  throwParams: {},
  throwSound: true,
};

function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function LabClient() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<SkeletonOverlayHandle>(null);
  const graphRef = useRef<SpeedGraphHandle>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage
    setPrefs(loadPrefs());
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {}
  }, [prefs, hydrated]);

  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]) => setPrefs((p) => ({ ...p, [key]: value }));

  const { state: cam, devices, retry: retryCamera } = useCamera(videoRef, hydrated ? prefs.deviceId : undefined);
  const live = cam.status === "live";

  // ── Per-frame pipeline state (refs: the pose loop must not re-render React) ──
  const [smoother] = useState(() => new PoseSmoother(SMOOTHED, DEFAULT_SMOOTHING));
  const [kinTracker] = useState(() => new KinematicsTracker());
  const [detector] = useState(() => new ThrowDetector());
  const [lastThrow, setLastThrow] = useState<ThrowEvent | null>(null);
  const [throwLog, setThrowLog] = useState<ThrowEvent[]>([]);
  const prefsRef = useRef(prefs);
  const camRef = useRef({ width: 1280, height: 720 });
  const kinRef = useRef<KinematicsFrame | null>(null);

  useEffect(() => {
    prefsRef.current = prefs;
    smoother.setParams({ minCutoff: prefs.minCutoff, beta: prefs.beta });
    detector.setParams({ ...DEFAULT_THROW_PARAMS, ...prefs.throwParams });
  }, [prefs, smoother, detector]);
  useEffect(() => {
    if (cam.status === "live") camRef.current = { width: cam.width, height: cam.height };
  }, [cam]);

  const getMeta = useCallback(
    () => ({ video: camRef.current, model: prefsRef.current.model, hand: kinRef.current?.hand ?? ("right" as const) }),
    [],
  );
  const recorder = useRecorder(getMeta);
  const recorderPush = recorder.push;
  const recordingRef = useRef(false);
  useEffect(() => {
    recordingRef.current = recorder.phase.kind === "recording";
  }, [recorder.phase]);

  /** Shared per-frame pipeline: live camera frames and recording replays both go through here. */
  const processFrame = useCallback(
    (pose: NormalizedLandmark[] | undefined, t: number, aspect: number, opts: { live: boolean; hand?: HandChoice }) => {
      const p = prefsRef.current;
      const smoothed = p.smoothing ? smoother.apply(pose, t) : pose;
      const kin = kinTracker.update(smoothed, t, aspect, opts.hand ?? p.hand);
      kinRef.current = kin;

      if (opts.live) recorderPush(pose, t); // raw landmarks: smoothing is re-tunable offline
      graphRef.current?.push(t, kin, opts.live && recordingRef.current);

      const ev = detector.updateFrame(kin, t);
      if (ev) {
        graphRef.current?.markThrow(t);
        setLastThrow(ev);
        setThrowLog((log) => [ev, ...log].slice(0, 50));
        if (p.throwSound) beep(520 + ev.power * 700, 160, 0.12);
      }
      overlayRef.current?.draw(p.showSkeleton ? smoothed : undefined, {
        raw: p.compareRaw ? pose : undefined,
        kin: p.showVector ? kin : undefined,
      });
    },
    [smoother, kinTracker, detector, recorderPush],
  );

  // ── Replay: run a saved recording through the same pipeline ──
  const replayRef = useRef<{ raf: number } | null>(null);
  const [replay, setReplay] = useState<{ rec: Recording; startedAt: number } | null>(null);

  const resetPipeline = useCallback(() => {
    smoother.reset();
    kinTracker.reset();
    detector.reset();
  }, [smoother, kinTracker, detector]);

  const stopReplay = useCallback(() => {
    if (replayRef.current) cancelAnimationFrame(replayRef.current.raf);
    replayRef.current = null;
    setReplay(null);
    resetPipeline();
  }, [resetPipeline]);

  const startReplay = useCallback(
    (rec: Recording) => {
      if (replayRef.current) cancelAnimationFrame(replayRef.current.raf);
      resetPipeline();
      const aspect = rec.video.width / rec.video.height;
      const start = performance.now();
      let i = 0;
      const step = () => {
        const elapsed = performance.now() - start;
        while (i < rec.frames.length && rec.frames[i].t <= elapsed) {
          const f = rec.frames[i++];
          let pose: NormalizedLandmark[] | undefined;
          if (f.landmarks.length) {
            pose = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
            for (const l of f.landmarks) pose[l.i] = { x: l.x, y: l.y, z: l.z, visibility: l.v };
          }
          processFrame(pose, start + f.t, aspect, { live: false, hand: rec.hand });
        }
        if (i < rec.frames.length) replayRef.current = { raf: requestAnimationFrame(step) };
        else window.setTimeout(stopReplay, 600); // let the last flash land
      };
      replayRef.current = { raf: requestAnimationFrame(step) };
      setReplay({ rec, startedAt: start });
    },
    [processFrame, resetPipeline, stopReplay],
  );
  useEffect(() => () => {
    if (replayRef.current) cancelAnimationFrame(replayRef.current.raf);
  }, []);

  const onFrame = useCallback(
    ({ pose, t }: PoseFrame) => {
      if (replayRef.current) return; // replay owns the pipeline
      const { width, height } = camRef.current;
      processFrame(pose, t, width / height, { live: true });
    },
    [processFrame],
  );

  const { state: tracker, stats, retry: retryTracker } = usePoseTracking(videoRef, {
    enabled: live,
    model: prefs.model,
    onFrame,
  });
  const tracking = tracker.status === "ready";

  // Motion numbers refresh at 10 Hz: readable, and cheap.
  const [kinView, setKinView] = useState<{ kin: KinematicsFrame | null; peak: number; state: DetectorState }>({
    kin: null,
    peak: 0,
    state: "IDLE",
  });
  useEffect(() => {
    if (!tracking) return;
    const id = window.setInterval(
      () => setKinView({ kin: kinRef.current, peak: graphRef.current?.peak(1500) ?? 0, state: detector.state }),
      KIN_UI_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, [tracking, detector]);

  // ── Recorder controls + keyboard shortcuts (for when you're standing back) ──
  const { start, stop } = recorder;
  const phaseKind = recorder.phase.kind;
  const toggleRecording = useCallback(() => {
    if (phaseKind !== "idle") return void stop();
    if (!tracking || replayRef.current) return;
    const p = prefsRef.current;
    start(p.label, { countdownSec: p.countdownSec, durationSec: p.durationSec });
  }, [phaseKind, tracking, start, stop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, select, textarea, [contenteditable]")) return;
      if (e.key === "r" || e.key === "R" || e.key === " ") {
        e.preventDefault();
        toggleRecording();
      } else if (/^[1-5]$/.test(e.key) && phaseKind === "idle") {
        setPrefs((p) => ({ ...p, label: RECORD_LABELS[Number(e.key) - 1] }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleRecording, phaseKind]);

  const fpsTone = stats.fps >= 28 ? "good" : stats.fps >= 18 ? "warn" : "bad";
  const confTone = stats.confidence >= 0.75 ? "good" : stats.confidence >= 0.5 ? "warn" : "bad";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <CameraFeed videoRef={videoRef} mirrored={prefs.mirrored} showVideo={prefs.showVideo && !replay}>
          {live && (
            <SkeletonOverlay
              ref={overlayRef}
              width={cam.width}
              height={cam.height}
              mirrored={prefs.mirrored}
              style={{ showLegs: prefs.showLegs, minVisibility: 0.5 }}
            />
          )}

          {/* Top-left status */}
          <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2">
            <StatusPill cam={cam.status} tracker={tracker.status} />
            {tracking && (
              <span className="glass rounded-full px-3 py-1 font-mono text-xs tabular-nums">{stats.fps.toFixed(0)} fps</span>
            )}
          </div>

          <RecordingLayer phase={recorder.phase} />
          {replay && (
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2 rounded-full bg-cream px-3 py-1 text-xs font-bold text-ink">
              ▶ REPLAY {LABEL_INFO[replay.rec.label].name} · {(replay.rec.durationMs / 1000).toFixed(1)}s
              <button type="button" onClick={stopReplay} className="ml-1 rounded-full bg-ink px-2 text-cream hover:bg-hoop">
                Stop
              </button>
            </div>
          )}
          <ThrowFlash event={lastThrow} />

          {/* Framing coach */}
          {tracking && stats.framing && recorder.phase.kind === "idle" && !replay && (
            <div className="absolute inset-x-0 bottom-5 flex justify-center">
              <span className="glass rounded-full px-4 py-2 text-sm font-medium">{FRAMING_MESSAGES[stats.framing]}</span>
            </div>
          )}

          {(cam.status === "requesting" || cam.status === "idle") && (
            <Overlay title="Waiting for camera…" body="Allow camera access when your browser asks. Video stays on this device." />
          )}
          {live && tracker.status === "loading" && (
            <Overlay title="Loading pose model…" body={`Downloading the ${tracker.model} model. This only takes a moment.`} spinner />
          )}
          {tracker.status === "error" && (
            <Overlay title="Pose model failed to load" body="Check your connection and try again." action={{ label: "Retry", onClick: retryTracker }} />
          )}
          {cam.status === "error" && <CameraError kind={cam.kind} detail={cam.detail} onRetry={retryCamera} />}
        </CameraFeed>

        <p className="flex items-center gap-2 text-xs text-stone">
          <LockIcon /> All tracking runs on your device. Recordings store landmark numbers only, never video.
        </p>

        <KinematicsPanel
          kin={kinView.kin}
          peak={kinView.peak}
          hand={prefs.hand}
          onHandChange={(h) => set("hand", h)}
          graphRef={graphRef}
        />

        <DetectorPanel
          state={kinView.state}
          last={lastThrow}
          log={throwLog}
          params={{ ...DEFAULT_THROW_PARAMS, ...prefs.throwParams }}
          onParam={(key, value) => setPrefs((p) => ({ ...p, throwParams: { ...p.throwParams, [key]: value } }))}
          onReset={() => set("throwParams", {})}
        />
      </div>

      <aside className="flex flex-col gap-4">
        <RecorderPanel
          phase={recorder.phase}
          recordings={recorder.recordings}
          error={recorder.error}
          label={prefs.label}
          countdownSec={prefs.countdownSec}
          durationSec={prefs.durationSec}
          canRecord={tracking}
          onLabel={(l) => set("label", l)}
          onCountdown={(s) => set("countdownSec", s)}
          onDuration={(s) => set("durationSec", s)}
          onToggle={toggleRecording}
          onDelete={recorder.remove}
          onReplay={startReplay}
          replayingId={replay?.rec.id ?? null}
          onClear={recorder.clearAll}
        />

        <Panel title="Tracking" aside={tracking && <span className="font-mono text-[11px] text-muted">{tracker.delegate}</span>}>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Frame rate" value={tracking ? stats.fps.toFixed(0) : "–"} unit="fps" tone={tracking ? fpsTone : "default"} />
            <Stat label="Inference" value={tracking ? stats.inferenceMs.toFixed(1) : "–"} unit="ms" />
          </div>
          <div className="mt-3">
            <div className="mb-1.5 flex justify-between text-[11px] text-muted">
              <span>Tracking confidence</span>
              <span className="font-mono tabular-nums">{tracking ? Math.round(stats.confidence * 100) : 0}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${
                  { good: "bg-good", warn: "bg-warn", bad: "bg-bad", default: "bg-white/30" }[tracking ? confTone : "default"]
                }`}
                style={{ width: `${tracking ? stats.confidence * 100 : 0}%` }}
              />
            </div>
          </div>
        </Panel>

        <Panel title="Smoothing" aside={<span className="font-mono text-[10px] text-muted">One Euro</span>}>
          <Toggle label="Smooth landmarks" checked={prefs.smoothing} onChange={(v) => set("smoothing", v)} />
          <div className={prefs.smoothing ? "" : "pointer-events-none opacity-40"}>
            <Slider
              label="Min cutoff"
              value={prefs.minCutoff}
              min={0.1}
              max={5}
              step={0.1}
              format={(v) => `${v.toFixed(1)} Hz`}
              onChange={(v) => set("minCutoff", v)}
              hint="Lower = steadier when still"
            />
            <Slider
              label="Beta"
              value={prefs.beta}
              min={0}
              max={8}
              step={0.1}
              format={(v) => v.toFixed(1)}
              onChange={(v) => set("beta", v)}
              hint="Higher = less lag on fast throws"
            />
          </div>
          <Toggle label="Compare raw (blue dots)" checked={prefs.compareRaw} onChange={(v) => set("compareRaw", v)} />
          <Toggle label="Velocity arrow" checked={prefs.showVector} onChange={(v) => set("showVector", v)} />
          <Toggle label="Sound on throw" checked={prefs.throwSound} onChange={(v) => set("throwSound", v)} />
          <button
            type="button"
            onClick={() => setPrefs((p) => ({ ...p, ...DEFAULT_SMOOTHING }))}
            className="mt-1 text-[11px] text-muted underline underline-offset-2 hover:text-cream"
          >
            Reset to defaults
          </button>
        </Panel>

        <Panel title="Model">
          <Segmented value={prefs.model} options={MODELS} onChange={(v) => set("model", v)} disabled={tracker.status === "loading"} />
          <p className="mt-2 text-xs text-muted">{MODELS.find((m) => m.value === prefs.model)?.hint}</p>
        </Panel>

        <Panel title="Display">
          <Toggle label="Mirror video" checked={prefs.mirrored} onChange={(v) => set("mirrored", v)} />
          <Toggle label="Show camera" checked={prefs.showVideo} onChange={(v) => set("showVideo", v)} />
          <Toggle label="Show skeleton" checked={prefs.showSkeleton} onChange={(v) => set("showSkeleton", v)} />
          <Toggle label="Show legs" checked={prefs.showLegs} onChange={(v) => set("showLegs", v)} />
        </Panel>

        {devices.length > 1 && (
          <Panel title="Camera">
            <select
              value={prefs.deviceId ?? ""}
              onChange={(e) => set("deviceId", e.target.value || undefined)}
              className="w-full rounded-xl border border-line bg-elevated px-3 py-2 text-sm outline-none focus:border-hoop"
            >
              <option value="">Default camera</option>
              {devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </Panel>
        )}
      </aside>
    </div>
  );
}

/** Big "THROW!" splash with power, readable from across the room. */
function ThrowFlash({ event }: { event: ThrowEvent | null }) {
  if (!event) return null;
  return (
    <div key={event.t} className="animate-throw-flash pointer-events-none absolute inset-0 z-20 grid place-items-center">
      <div className="text-center drop-shadow-[0_6px_24px_rgba(0,0,0,.6)]">
        <div className="display text-[16vmin] leading-none text-hoop">Throw!</div>
        <div className="mt-1 font-mono text-lg text-cream">
          power {(event.power * 100).toFixed(0)}% · {event.angle.toFixed(0)}° · arc {(event.arc * 100).toFixed(0)}%
        </div>
      </div>
    </div>
  );
}

/** Big countdown, red frame and a REC timer, readable from across the room. */
function RecordingLayer({ phase }: { phase: RecorderPhase }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (phase.kind === "idle") return;
    const id = window.setInterval(() => setNow(performance.now()), 50);
    return () => window.clearInterval(id);
  }, [phase.kind]);

  if (phase.kind === "countdown") {
    const left = Math.max(1, Math.ceil((phase.endsAt - now) / 1000));
    return (
      <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-ink/35">
        <div className="text-center">
          <div key={left} className="display animate-count-pop text-[22vmin] leading-none text-cream drop-shadow-lg">
            {left}
          </div>
          <div className="mt-2 font-display text-xl tracking-wide text-cream uppercase">Get ready: {LABEL_INFO[phase.label].name}</div>
        </div>
      </div>
    );
  }
  if (phase.kind === "recording") {
    const elapsed = Math.max(0, (now - phase.startedAt) / 1000);
    return (
      <>
        <div className="pointer-events-none absolute inset-0 z-20 rounded-3xl ring-4 ring-hoop ring-inset" />
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2 rounded-full bg-hoop px-3 py-1 text-xs font-bold text-cream">
          <span className="size-2 animate-pulse rounded-full bg-cream" />
          REC {LABEL_INFO[phase.label].name} · <span className="font-mono tabular-nums">{elapsed.toFixed(1)}s</span>
        </div>
      </>
    );
  }
  return null;
}

function StatusPill({ cam, tracker }: { cam: string; tracker: string }) {
  const [label, color] =
    cam === "error" || tracker === "error"
      ? ["Error", "bg-bad"]
      : cam !== "live"
        ? ["Starting camera", "bg-warn"]
        : tracker === "ready"
          ? ["Tracking", "bg-good"]
          : ["Starting", "bg-warn"];
  return (
    <span className="glass flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium">
      <span className="relative flex size-2">
        {label === "Tracking" && <span className={`animate-pulse-ring absolute inset-0 rounded-full ${color}`} />}
        <span className={`relative size-2 rounded-full ${color}`} />
      </span>
      {label}
    </span>
  );
}

function Overlay({
  title,
  body,
  spinner,
  action,
}: {
  title: string;
  body: string;
  spinner?: boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-ink/70 p-6 text-center backdrop-blur-sm">
      <div className="max-w-xs">
        {spinner && <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-white/15 border-t-hoop" />}
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <p className="mt-1.5 text-sm text-muted">{body}</p>
        {action && (
          <button onClick={action.onClick} className="mt-4 rounded-full bg-hoop px-5 py-2 text-sm font-semibold text-ink hover:bg-hoop-soft">
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
