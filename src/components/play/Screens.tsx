"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { LightingStatus } from "@/hooks/useLighting";
import { CALIBRATION_THROWS, consistency, type Calibration } from "@/lib/game/calibration";
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId } from "@/lib/game/difficulty";
import {
  clampTimedSeconds,
  CUSTOM_MINUTES,
  formatDuration,
  isPresetDuration,
  MODES,
  MODE_ORDER,
  TIMED_OPTIONS,
  type Best,
  type ModeId,
} from "@/lib/game/modes";
import type { Tally } from "@/lib/game/scoring";
import type { FramingIssue } from "@/lib/pose/landmarks";

/* ───────── Shared shell ───────── */

export function Modal({ children, wide, label }: { children: ReactNode; wide?: boolean; label: string }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-ink/70 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-label={label}>
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-3xl border border-cream/10 bg-ink/92 p-6 shadow-2xl sm:p-8`}>{children}</div>
    </div>
  );
}

function Primary({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-full bg-hoop py-3 font-semibold text-cream transition hover:bg-hoop-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Secondary({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full rounded-full border border-cream/15 py-2.5 text-sm text-cream/85 transition hover:border-cream/40">
      {children}
    </button>
  );
}

const Eyebrow = ({ children }: { children: ReactNode }) => <p className="text-xs tracking-[0.16em] text-hoop uppercase">{children}</p>;

/* ───────── Start menu ───────── */

const HOW_TO = [
  ["Step back", "Head, shoulders and hips in the camera."],
  ["Hold it high", "Both hands up, like the ball is above your head."],
  ["Pause", "A beat of stillness is your set point. The ball glows yellow."],
  ["Push up and out", "Your normal push scores once calibrated. Harder = longer."],
];

export function StartMenu(p: {
  firstTime: boolean;
  mode: ModeId;
  difficulty: DifficultyId;
  timedSeconds: number;
  calibration: Calibration | null;
  camera: boolean;
  best: Best | undefined;
  onMode: (m: ModeId) => void;
  onTimedSeconds: (s: number) => void;
  onDifficulty: (d: DifficultyId) => void;
  onCalibrate: () => void;
  onStart: () => void;
}) {
  const d = DIFFICULTIES[p.difficulty];
  return (
    <Modal wide label="Start menu">
      <Eyebrow>{p.firstTime ? "How to play" : "Ready when you are"}</Eyebrow>
      <h1 className="display mt-2 text-5xl">Shoot your shot</h1>

      {p.firstTime && (
        <ol className="mt-5 grid gap-3 text-sm text-cream/85 sm:grid-cols-2">
          {HOW_TO.map(([t, desc], i) => (
            <li key={t} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-hoop text-xs font-bold">{i + 1}</span>
              <span>
                <b className="text-cream">{t}.</b> {desc}
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-6 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Game mode">
        {MODE_ORDER.map((id) => {
          const m = MODES[id];
          const on = id === p.mode;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => p.onMode(id)}
              className={`rounded-2xl border p-3 text-left transition ${on ? "border-hoop bg-hoop/15" : "border-cream/10 hover:border-cream/30"}`}
            >
              <div className="display text-xl">{id === "timed" ? `${m.name} · ${formatDuration(p.timedSeconds)}` : m.name}</div>
              <div className="mt-1 text-xs leading-snug text-cream/65">{m.blurb}</div>
            </button>
          );
        })}
      </div>

      {p.mode === "timed" && <ShotClockPicker seconds={p.timedSeconds} onChange={p.onTimedSeconds} />}

      <div className="mt-4">
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-white/5 p-1" role="radiogroup" aria-label="Difficulty">
          {DIFFICULTY_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={id === p.difficulty}
              onClick={() => p.onDifficulty(id)}
              className={`rounded-lg py-2 text-xs font-semibold transition sm:text-sm ${id === p.difficulty ? "bg-cream text-ink" : "text-cream/70 hover:text-cream"}`}
            >
              {DIFFICULTIES[id].name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-cream/60">
          {d.blurb} · {d.distance} m{d.hoopMotion ? " · moving hoop" : ""}
          {d.windMax ? ` · wind ±${d.windMax}` : ""}
          {d.scoreMultiplier > 1 ? ` · ×${d.scoreMultiplier} points` : ""}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-4 py-3 text-sm">
        {p.camera ? (
          p.calibration ? (
            <span className="text-cream/80">
              <span className="text-good">●</span> Calibrated: your throw {p.calibration.avg.toFixed(1)} t/s ±{Math.round(consistency(p.calibration) * 100)}%
            </span>
          ) : (
            <span className="text-cream/80">
              <span className="text-warn">●</span> Not calibrated. 3 practice throws make your normal shot score.
            </span>
          )
        ) : (
          <span className="text-cream/70">Keyboard mode: hold Space to shoot.</span>
        )}
        {p.camera && (
          <button type="button" onClick={p.onCalibrate} className="text-xs font-semibold text-hoop-soft underline underline-offset-4">
            {p.calibration ? "Recalibrate" : "Calibrate now"}
          </button>
        )}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <Primary onClick={p.onStart}>
          Play {MODES[p.mode].name}
          {p.mode === "timed" ? ` · ${formatDuration(p.timedSeconds)}` : ""}
        </Primary>
        {p.best && (
          <span className="text-center text-xs text-cream/60 sm:text-right">
            Best: <b className="text-cream">{p.mode === "streak" ? `${p.best.streak} in a row` : `${p.best.points} pts`}</b>
          </span>
        )}
      </div>
      <p className="mt-3 text-center text-[11px] text-cream/45">
        Video never leaves your device ·{" "}
        <Link href="/lab" className="underline underline-offset-2 hover:text-cream">
          Tune tracking in the Lab
        </Link>
      </p>
    </Modal>
  );
}

/** Preset shot clocks plus a "Custom" chip that reveals a 1–30 minute stepper. */
function ShotClockPicker({ seconds, onChange }: { seconds: number; onChange: (s: number) => void }) {
  const [custom, setCustom] = useState(!isPresetDuration(seconds));
  const minutes = Math.round(seconds / 60);
  const setMinutes = (m: number) => onChange(clampTimedSeconds(m * 60));
  const chip = (on: boolean) =>
    `rounded-lg py-1.5 font-mono text-xs font-semibold transition ${on ? "bg-hoop text-cream" : "text-cream/70 hover:text-cream"}`;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-3">
        <span className="text-xs text-cream/60">Shot clock</span>
        <div className="grid flex-1 grid-cols-5 gap-1 rounded-xl bg-white/5 p-1" role="radiogroup" aria-label="Shot clock">
          {TIMED_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={!custom && s === seconds}
              onClick={() => {
                setCustom(false);
                onChange(s);
              }}
              className={chip(!custom && s === seconds)}
            >
              {formatDuration(s)}
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={custom}
            onClick={() => {
              setCustom(true);
              // Start from a duration the presets don't already cover.
              if (isPresetDuration(seconds)) onChange(180);
            }}
            className={chip(custom)}
          >
            Custom
          </button>
        </div>
      </div>
      {custom && (
        <div className="mt-2 flex items-center justify-end gap-2">
          <span className="text-xs text-cream/60">Minutes</span>
          <button
            type="button"
            aria-label="One minute less"
            onClick={() => setMinutes(minutes - 1)}
            disabled={minutes <= CUSTOM_MINUTES.min}
            className="grid size-8 place-items-center rounded-lg bg-white/5 text-lg hover:bg-white/10 disabled:opacity-30"
          >
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            aria-label="Custom shot clock in minutes"
            min={CUSTOM_MINUTES.min}
            max={CUSTOM_MINUTES.max}
            step={1}
            value={minutes}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (e.target.value !== "" && Number.isFinite(v)) setMinutes(v);
            }}
            className="w-16 rounded-lg border border-cream/15 bg-ink px-2 py-1.5 text-center font-mono text-sm text-cream outline-none focus:border-hoop"
          />
          <button
            type="button"
            aria-label="One minute more"
            onClick={() => setMinutes(minutes + 1)}
            disabled={minutes >= CUSTOM_MINUTES.max}
            className="grid size-8 place-items-center rounded-lg bg-white/5 text-lg hover:bg-white/10 disabled:opacity-30"
          >
            +
          </button>
          <span className="text-[11px] text-cream/45">
            {CUSTOM_MINUTES.min}–{CUSTOM_MINUTES.max} min
          </span>
        </div>
      )}
    </div>
  );
}

/* ───────── Move-into-frame guide ───────── */

type CheckState = "ok" | "bad" | "wait";

export function SetupCheck(p: {
  cameraLive: boolean;
  tracking: boolean;
  framing: FramingIssue | null;
  confidence: number;
  lighting: LightingStatus;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const f = p.framing;
  const seen = p.tracking && f !== "no_person";
  const checks: { label: string; state: CheckState; fix: string }[] = [
    { label: "Camera on", state: p.cameraLive ? "ok" : "wait", fix: "Allow camera access" },
    { label: "Tracking loaded", state: p.tracking ? "ok" : "wait", fix: "Downloading the pose model…" },
    { label: "You're in view", state: !p.tracking ? "wait" : seen ? "ok" : "bad", fix: "Step in front of the camera" },
    {
      label: "Good distance",
      state: !seen ? "wait" : f === "too_close" || f === "too_far" ? "bad" : "ok",
      fix: f === "too_far" ? "Come a bit closer" : "Step back until your hips are in view",
    },
    { label: "Centred", state: !seen ? "wait" : f === "off_center" ? "bad" : "ok", fix: "Move toward the middle" },
    {
      label: "Upper body visible",
      state: !seen ? "wait" : f === "low_visibility" || p.confidence < 0.6 ? "bad" : "ok",
      fix: "Show shoulders, arms and hips; avoid loose sleeves",
    },
    {
      label: "Lighting",
      state: p.lighting === "unknown" ? "wait" : p.lighting === "ok" ? "ok" : "bad",
      fix: p.lighting === "dark" ? "Turn on a light in front of you" : "Bright window behind you: face it or close the blinds",
    },
  ];
  const allOk = checks.every((c) => c.state === "ok");
  const firstBad = checks.find((c) => c.state !== "ok");

  return (
    <Modal label="Camera setup">
      <Eyebrow>Get in position</Eyebrow>
      <h2 className="display mt-2 text-4xl">Move into frame</h2>
      <ul className="mt-5 space-y-2">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-3 text-sm">
            <span
              className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                c.state === "ok" ? "bg-good text-ink" : c.state === "bad" ? "bg-bad text-ink" : "bg-white/10 text-cream/50"
              }`}
              aria-hidden
            >
              {c.state === "ok" ? "✓" : c.state === "bad" ? "!" : "…"}
            </span>
            <span className={c.state === "ok" ? "text-cream" : "text-cream/70"}>{c.label}</span>
          </li>
        ))}
      </ul>
      <p className={`mt-4 rounded-xl px-3 py-2 text-sm ${allOk ? "bg-good/15 text-good" : "bg-white/5 text-cream/80"}`} aria-live="polite">
        {allOk ? "Looking good!" : firstBad?.fix}
      </p>
      <div className="mt-6 space-y-2">
        <Primary onClick={p.onContinue} disabled={!allOk}>
          Continue
        </Primary>
        <Secondary onClick={p.onSkip}>Skip check</Secondary>
      </div>
    </Modal>
  );
}

/* ───────── Calibration ───────── */

export function CalibrationPanel(p: {
  samples: number[];
  outlier: boolean;
  loaded: boolean;
  result: Calibration | null;
  onRedo: () => void;
  onSave: () => void;
  onSkip: () => void;
}) {
  const done = p.samples.length >= CALIBRATION_THROWS;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 z-30 flex justify-center px-4 sm:top-28">
      <div className="pointer-events-auto w-full max-w-md rounded-3xl border border-cream/10 bg-ink/90 p-5 shadow-2xl backdrop-blur" role="dialog" aria-label="Calibration">
        <Eyebrow>Calibration</Eyebrow>
        <h2 className="display mt-1 text-3xl">{done ? "Got your shot" : `Practice throw ${p.samples.length + 1} of ${CALIBRATION_THROWS}`}</h2>
        <p className="mt-1 text-sm text-cream/70">
          {done
            ? "Your normal throw will now land in the hoop at any distance."
            : p.loaded
              ? "Loaded! Push up and out with your normal, comfortable shot."
              : "Raise the ball above your head and pause until it glows."}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {Array.from({ length: CALIBRATION_THROWS }, (_, i) => {
            const v = p.samples[i];
            return (
              <div
                key={i}
                className={`rounded-2xl border px-2 py-3 text-center transition ${
                  v !== undefined ? "border-good/60 bg-good/10" : i === p.samples.length ? "animate-pulse border-hoop/60" : "border-cream/10"
                }`}
              >
                <div className="font-mono text-xl tabular-nums">{v !== undefined ? v.toFixed(1) : "–"}</div>
                <div className="text-[10px] tracking-wide text-cream/50 uppercase">torso/s</div>
              </div>
            );
          })}
        </div>
        {p.outlier && !done && (
          <p className="mt-3 rounded-xl bg-warn/15 px-3 py-2 text-xs text-warn">That one was very different from the others. Redo it?</p>
        )}
        {done && p.result && (
          <p className="mt-3 text-xs text-cream/70">
            Average <b className="text-cream">{p.result.avg.toFixed(2)}</b> · consistency ±{Math.round(consistency(p.result) * 100)}%
            {consistency(p.result) > 0.25 ? " (pretty varied: Rookie or Starter will feel fairest)" : ""}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          {done ? (
            <Primary onClick={p.onSave}>Save &amp; continue</Primary>
          ) : (
            <span className="flex-1 self-center text-xs text-cream/50">Throws here don&apos;t count.</span>
          )}
          {p.samples.length > 0 && (
            <button type="button" onClick={p.onRedo} className="rounded-full border border-cream/15 px-4 text-sm text-cream/80 hover:border-cream/40">
              Redo last
            </button>
          )}
          {!done && (
            <button type="button" onClick={p.onSkip} className="rounded-full px-3 text-sm text-cream/60 hover:text-cream">
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────── Pause ───────── */

export function PauseMenu(p: {
  sound: boolean;
  camera: boolean;
  onResume: () => void;
  onRestart: () => void;
  onRecalibrate: () => void;
  onMenu: () => void;
  onSound: () => void;
  onCamera: () => void;
}) {
  return (
    <Modal label="Paused">
      <Eyebrow>Paused</Eyebrow>
      <h2 className="display mt-2 text-5xl">Timeout</h2>
      <div className="mt-6 space-y-2">
        <Primary onClick={p.onResume}>Resume</Primary>
        <Secondary onClick={p.onRestart}>Restart</Secondary>
        {p.camera && <Secondary onClick={p.onRecalibrate}>Recalibrate</Secondary>}
        <Secondary onClick={p.onMenu}>Change mode / difficulty</Secondary>
      </div>
      <div className="mt-5 flex justify-center gap-4 text-xs text-cream/70">
        <button type="button" onClick={p.onSound} className="underline underline-offset-4 hover:text-cream">
          Sound {p.sound ? "on" : "off"}
        </button>
        <button type="button" onClick={p.onCamera} className="underline underline-offset-4 hover:text-cream">
          Camera {p.camera ? "on" : "off"}
        </button>
        <Link href="/" className="underline underline-offset-4 hover:text-cream">
          Quit
        </Link>
      </div>
      <p className="mt-4 text-center text-[11px] text-cream/40">Esc or P to resume</p>
    </Modal>
  );
}

/* ───────── Game over ───────── */

export function GameOver(p: {
  mode: ModeId;
  difficulty: DifficultyId;
  timedSeconds: number;
  tally: Tally;
  newBest: boolean;
  best: Best | undefined;
  onAgain: () => void;
  onMenu: () => void;
}) {
  const t = p.tally;
  const accuracy = t.shots ? Math.round((t.makes / t.shots) * 100) : 0;
  const headline = p.mode === "streak" ? `${t.best} in a row` : `${t.points} points`;
  return (
    <Modal label="Game over">
      <Eyebrow>
        {MODES[p.mode].name}
        {p.mode === "timed" ? ` ${formatDuration(p.timedSeconds)}` : ""} · {DIFFICULTIES[p.difficulty].name}
      </Eyebrow>
      <h2 className="display mt-2 text-5xl">{p.mode === "timed" ? "Buzzer!" : p.mode === "streak" ? "Streak over" : "Nice session"}</h2>
      <div className="mt-4 flex items-baseline gap-3">
        <span className="display text-6xl text-hoop">{headline}</span>
        {p.newBest && <span className="animate-count-pop rounded-full bg-sun px-3 py-1 text-xs font-bold text-ink">NEW BEST</span>}
      </div>
      <dl className="mt-5 grid grid-cols-4 gap-2 text-center">
        {[
          ["Makes", `${t.makes}/${t.shots}`],
          ["Accuracy", `${accuracy}%`],
          ["Swishes", t.swishes],
          ["Best streak", t.best],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-white/[0.04] py-2">
            <dt className="text-[10px] tracking-wide text-cream/50 uppercase">{k}</dt>
            <dd className="font-mono text-lg tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {!p.newBest && p.best && (
        <p className="mt-3 text-center text-xs text-cream/55">
          Your best: {p.mode === "streak" ? `${p.best.streak} in a row` : `${p.best.points} pts`}
        </p>
      )}
      <div className="mt-6 space-y-2">
        <Primary onClick={p.onAgain}>Play again</Primary>
        <Secondary onClick={p.onMenu}>Change mode</Secondary>
      </div>
    </Modal>
  );
}
