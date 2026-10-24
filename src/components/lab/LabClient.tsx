"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCamera } from "@/hooks/useCamera";
import { usePoseTracking, type PoseFrame } from "@/hooks/usePoseTracking";
import { FRAMING_MESSAGES } from "@/lib/pose/landmarks";
import type { PoseModel } from "@/lib/pose/poseLandmarker";
import { CameraFeed } from "./CameraFeed";
import { CameraError } from "./CameraError";
import { SkeletonOverlay, type SkeletonOverlayHandle } from "./SkeletonOverlay";
import { Panel, Segmented, Stat, Toggle } from "./Controls";

const MODELS: { value: PoseModel; label: string; hint: string }[] = [
  { value: "lite", label: "Lite", hint: "Fastest. Best for laptops and phones." },
  { value: "full", label: "Full", hint: "Balanced accuracy and speed." },
  { value: "heavy", label: "Heavy", hint: "Most accurate. Needs a strong GPU." },
];

const PREFS_KEY = "airhoops.lab.prefs";

interface Prefs {
  model: PoseModel;
  mirrored: boolean;
  showVideo: boolean;
  showSkeleton: boolean;
  showLegs: boolean;
  deviceId?: string;
}

const DEFAULT_PREFS: Prefs = { model: "lite", mirrored: true, showVideo: true, showSkeleton: true, showLegs: false };

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

  const showSkeleton = prefs.showSkeleton;
  const onFrame = useCallback(
    ({ pose }: PoseFrame) => overlayRef.current?.draw(showSkeleton ? pose : undefined),
    [showSkeleton],
  );
  const { state: tracker, stats, retry: retryTracker } = usePoseTracking(videoRef, {
    enabled: live,
    model: prefs.model,
    onFrame,
  });

  const fpsTone = stats.fps >= 28 ? "good" : stats.fps >= 18 ? "warn" : "bad";
  const confTone = stats.confidence >= 0.75 ? "good" : stats.confidence >= 0.5 ? "warn" : "bad";
  const tracking = tracker.status === "ready";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <CameraFeed videoRef={videoRef} mirrored={prefs.mirrored} showVideo={prefs.showVideo}>
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
              <span className="glass rounded-full px-3 py-1 font-mono text-xs tabular-nums">
                {stats.fps.toFixed(0)} fps
              </span>
            )}
          </div>

          {/* Framing coach */}
          {tracking && stats.framing && (
            <div className="absolute inset-x-0 bottom-5 flex justify-center">
              <span className="glass rounded-full px-4 py-2 text-sm font-medium">
                {FRAMING_MESSAGES[stats.framing]}
              </span>
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

        <p className="mt-3 flex items-center gap-2 text-xs text-stone">
          <LockIcon /> All tracking runs on your device. No video is recorded or uploaded.
        </p>
      </div>

      <aside className="flex flex-col gap-4">
        <Panel
          title="Tracking"
          aside={tracking && <span className="font-mono text-[11px] text-muted">{tracker.delegate}</span>}
        >
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
