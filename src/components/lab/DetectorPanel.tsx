"use client";

import { useState } from "react";
import { DEFAULT_THROW_PARAMS, type DetectorState, type ThrowEvent, type ThrowParams } from "@/lib/pose/throwDetector";
import { Panel, Slider } from "./Controls";

const STATES: { id: DetectorState; hint: string }[] = [
  { id: "IDLE", hint: "Waiting" },
  { id: "PICKUP", hint: "Hand at the hip: scooping the ball" },
  { id: "WINDUP", hint: "Hand up and steady: loaded" },
  { id: "THROW", hint: "Arm extending fast" },
  { id: "COOLDOWN", hint: "Throw fired, short pause" },
];

/** The thresholds worth tweaking live. Everything else stays at the lab-tuned default. */
const TUNABLE: { key: keyof ThrowParams; label: string; min: number; max: number; step: number; unit: string; hint: string }[] = [
  { key: "startSpeed", label: "Start speed", min: 0.5, max: 4, step: 0.1, unit: "torso/s", hint: "Wrist speed that starts a throw" },
  { key: "maxSetSpeed", label: "Set-point speed", min: 0.4, max: 4, step: 0.1, unit: "torso/s", hint: "Hand must be this still just before a shot (stops waves)" },
  { key: "minPeakSpeed", label: "Min peak speed", min: 0.5, max: 6, step: 0.1, unit: "torso/s", hint: "Throws slower than this are ignored" },
  { key: "minExtension", label: "Min reach", min: 0.3, max: 1.2, step: 0.01, unit: "×torso", hint: "Arm reach needed at release" },
  { key: "minExtensionGain", label: "Min reach gain", min: 0, max: 0.6, step: 0.01, unit: "×torso", hint: "How much the arm must extend" },
  { key: "minReleaseHeight", label: "Min release height", min: -1, max: 1, step: 0.05, unit: "×torso", hint: "Wrist vs shoulder at release (0 = level)" },
  { key: "minAngle", label: "Min angle", min: -30, max: 60, step: 1, unit: "°", hint: "Shots must travel upward (stops sideways swipes)" },
  { key: "cooldownMs", label: "Cooldown", min: 200, max: 2000, step: 50, unit: "ms", hint: "Pause after each throw" },
];

export function DetectorPanel({
  state,
  last,
  log,
  params,
  onParam,
  onReset,
}: {
  state: DetectorState;
  last: ThrowEvent | null;
  log: ThrowEvent[];
  params: ThrowParams;
  onParam: (key: keyof ThrowParams, value: number) => void;
  onReset: () => void;
}) {
  const [showTuning, setShowTuning] = useState(false);
  const [copied, setCopied] = useState(false);
  const changed = TUNABLE.filter((t) => params[t.key] !== DEFAULT_THROW_PARAMS[t.key]).length;

  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(params, null, 2)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Panel title="Throw detector" aside={<span className="font-mono text-[11px] text-muted">{log.length} throws</span>}>
      {/* State machine */}
      <div className="grid grid-cols-5 gap-1" role="list" aria-label="Detector state">
        {STATES.map((s, i) => {
          const active = s.id === state;
          return (
            <div
              key={s.id}
              role="listitem"
              aria-current={active}
              title={s.hint}
              className={`relative rounded-lg px-1 py-2 text-center font-mono text-[10px] tracking-wide transition ${
                active
                  ? s.id === "THROW"
                    ? "bg-hoop text-cream"
                    : s.id === "COOLDOWN"
                      ? "bg-good/90 text-ink"
                      : "bg-cream text-ink"
                  : "bg-white/[0.04] text-muted"
              }`}
            >
              {s.id}
              {i < STATES.length - 1 && <span className="absolute top-1/2 -right-1 hidden -translate-y-1/2 text-[8px] text-muted/50 sm:inline">›</span>}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted">{STATES.find((s) => s.id === state)?.hint}</p>

      {/* Last throw */}
      <div className="mt-4 rounded-xl bg-white/[0.03] p-3">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-[11px] tracking-[0.14em] text-muted uppercase">Last throw</span>
          {last && (
            <span className="font-mono text-[11px] text-muted">
              {last.hand} · {last.durationMs.toFixed(0)}ms{last.pickedUp ? " · scooped" : ""}
            </span>
          )}
        </div>
        {last ? (
          <div className="grid grid-cols-[1fr_auto] items-center gap-4">
            <div className="space-y-2.5">
              <Meter label="Power" value={last.power} detail={`peak ${last.peakSpeed.toFixed(1)} torso/s`} />
              <Meter label="Arc" value={last.arc} detail={`hand ${last.height >= 0 ? "+" : ""}${last.height.toFixed(2)} vs shoulder`} />
              <Meter label="Reach" value={Math.min(1, last.extension / 1.2)} detail={`${last.extension.toFixed(2)} ×torso`} />
            </div>
            <AngleDial angle={last.angle} />
          </div>
        ) : (
          <p className="py-4 text-center text-xs text-muted">Hold the ball up and pause for a beat, then push up and out, like a set shot.</p>
        )}
      </div>

      {log.length > 1 && (
        <ul className="mt-3 space-y-1 font-mono text-[11px] text-muted">
          {log.slice(1, 5).map((e) => (
            <li key={e.t} className="flex justify-between rounded-md bg-white/[0.02] px-2 py-1">
              <span>{e.hand[0].toUpperCase()}</span>
              <span>power {(e.power * 100).toFixed(0)}%</span>
              <span>{e.angle.toFixed(0)}°</span>
              <span>arc {(e.arc * 100).toFixed(0)}%</span>
            </li>
          ))}
        </ul>
      )}

      {/* Thresholds */}
      <button
        type="button"
        onClick={() => setShowTuning((v) => !v)}
        aria-expanded={showTuning}
        className="mt-4 flex w-full items-center justify-between rounded-lg px-1 py-1 text-xs text-muted hover:text-cream"
      >
        <span>Thresholds {changed > 0 && <span className="ml-1 rounded-full bg-warn/20 px-1.5 text-warn">{changed} changed</span>}</span>
        <span className={`transition ${showTuning ? "rotate-180" : ""}`}>⌄</span>
      </button>
      {showTuning && (
        <div className="mt-1">
          {TUNABLE.map((t) => (
            <Slider
              key={t.key}
              label={t.label}
              value={params[t.key]}
              min={t.min}
              max={t.max}
              step={t.step}
              format={(v) => `${t.step >= 1 ? v.toFixed(0) : v.toFixed(2)} ${t.unit}`}
              onChange={(v) => onParam(t.key, v)}
              hint={t.hint}
            />
          ))}
          <div className="mt-2 flex gap-3 text-[11px]">
            <button type="button" onClick={onReset} className="text-muted underline underline-offset-2 hover:text-cream">
              Reset to lab defaults
            </button>
            <button type="button" onClick={copy} className="text-muted underline underline-offset-2 hover:text-cream">
              {copied ? "Copied!" : "Copy params JSON"}
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}

function Meter({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px]">
        <span>{label}</span>
        <span className="font-mono text-muted">
          {(value * 100).toFixed(0)}% <span className="text-muted/60">· {detail}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-hoop transition-[width] duration-500" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

/** Quarter-circle dial showing the throw angle above horizontal. */
function AngleDial({ angle }: { angle: number }) {
  const a = Math.max(-30, Math.min(90, angle));
  const rad = (a * Math.PI) / 180;
  const r = 34;
  return (
    <svg viewBox="-6 -44 52 56" className="w-20" role="img" aria-label={`Angle ${angle.toFixed(0)} degrees`}>
      <path d={`M0 0 L${r} 0 A${r} ${r} 0 0 0 0 ${-r} Z`} fill="rgb(255 255 255 / .05)" />
      <line x1="0" y1="0" x2={r} y2="0" stroke="rgb(255 255 255 / .2)" />
      <line x1="0" y1="0" x2={Math.cos(rad) * r} y2={-Math.sin(rad) * r} stroke="#ea3a1d" strokeWidth="3" strokeLinecap="round" />
      <circle r="3" fill="#f7f1d6" />
      <text x="20" y="9" fontSize="9" fill="#f7f1d6" fontFamily="ui-monospace, monospace" textAnchor="middle">
        {angle.toFixed(0)}°
      </text>
    </svg>
  );
}
