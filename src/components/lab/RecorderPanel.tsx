"use client";

import { useState } from "react";
import type { RecorderPhase } from "@/hooks/useRecorder";
import { downloadJson } from "@/lib/browser";
import {
  countByLabel,
  LABEL_INFO,
  RECORD_LABELS,
  recordingFilename,
  TARGET_NON_THROWS,
  TARGET_THROWS,
  type RecordLabel,
  type Recording,
} from "@/lib/recorder/recording";
import { Panel, Segmented } from "./Controls";

const COUNTDOWNS = [
  { value: "0", label: "Off" },
  { value: "3", label: "3s" },
  { value: "5", label: "5s" },
];
const DURATIONS = [
  { value: "2", label: "2s" },
  { value: "3", label: "3s" },
  { value: "5", label: "5s" },
  { value: "manual", label: "Manual" },
];

interface Props {
  phase: RecorderPhase;
  recordings: Recording[];
  error: string | null;
  label: RecordLabel;
  countdownSec: number;
  durationSec: number | null;
  canRecord: boolean;
  onLabel: (l: RecordLabel) => void;
  onCountdown: (s: number) => void;
  onDuration: (s: number | null) => void;
  onToggle: () => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onReplay: (r: Recording) => void;
  replayingId: string | null;
}

export function RecorderPanel(p: Props) {
  const counts = countByLabel(p.recordings);
  const throws = counts.throw;
  const nonThrows = p.recordings.length - throws;
  const busy = p.phase.kind !== "idle";
  const [confirmClear, setConfirmClear] = useState(false);

  const downloadAll = () =>
    downloadJson(`airhoops-recordings_${new Date().toISOString().slice(0, 10)}.json`, {
      version: 1,
      count: p.recordings.length,
      recordings: p.recordings,
    });

  return (
    <Panel title="Recorder" aside={<kbd className="font-mono text-[10px] text-muted">R / Space · 1–6</kbd>}>
      {/* Label chips */}
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Label">
        {RECORD_LABELS.map((l, i) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={p.label === l}
            disabled={busy}
            title={`${LABEL_INFO[l].hint} (key ${i + 1})`}
            onClick={() => p.onLabel(l)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition disabled:opacity-50 ${
              p.label === l ? "border-hoop bg-hoop text-cream" : "border-line text-cream/80 hover:border-cream/30"
            }`}
          >
            {LABEL_INFO[l].name}
            <span className={`font-mono text-[10px] ${p.label === l ? "text-cream/80" : "text-muted"}`}>{counts[l]}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">{LABEL_INFO[p.label].hint}</p>

      <div className="mt-3 space-y-3">
        <div>
          <span className="mb-1 block text-[11px] text-muted">Countdown</span>
          <Segmented value={String(p.countdownSec)} options={COUNTDOWNS} onChange={(v) => p.onCountdown(Number(v))} disabled={busy} />
        </div>
        <div>
          <span className="mb-1 block text-[11px] text-muted">Length</span>
          <Segmented
            value={p.durationSec === null ? "manual" : String(p.durationSec)}
            options={DURATIONS}
            onChange={(v) => p.onDuration(v === "manual" ? null : Number(v))}
            disabled={busy}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={p.onToggle}
        disabled={!p.canRecord && !busy}
        className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold tracking-wide uppercase transition disabled:cursor-not-allowed disabled:opacity-40 ${
          p.phase.kind === "recording"
            ? "bg-cream text-ink hover:bg-white"
            : p.phase.kind === "countdown"
              ? "bg-warn text-ink"
              : "bg-hoop text-cream hover:bg-hoop-soft"
        }`}
      >
        {p.phase.kind === "recording" ? (
          <>
            <span className="size-2.5 rounded-sm bg-hoop" /> Stop
          </>
        ) : p.phase.kind === "countdown" ? (
          "Get ready… (cancel)"
        ) : (
          <>
            <span className="size-2.5 rounded-full bg-cream" /> Record {LABEL_INFO[p.label].name}
          </>
        )}
      </button>
      {!p.canRecord && !busy && <p className="mt-2 text-center text-[11px] text-muted">Start tracking to record.</p>}
      {p.error && <p className="mt-2 text-[11px] text-warn">{p.error}</p>}

      {/* Progress toward the dataset goal */}
      <div className="mt-4 space-y-2">
        <Progress label="Throws" value={throws} target={TARGET_THROWS} />
        <Progress label="Non-throws" value={nonThrows} target={TARGET_NON_THROWS} />
      </div>

      {p.recordings.length > 0 && (
        <>
          <ul className="no-scrollbar mt-4 max-h-56 space-y-1 overflow-y-auto" data-lenis-prevent>
            {p.recordings.map((r) => (
              <li key={r.id} className="group flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.label === "throw" ? "bg-hoop/20 text-hoop-soft" : "bg-white/10 text-cream/80"}`}>
                  {LABEL_INFO[r.label].name}
                </span>
                <span className="font-mono text-[11px] text-muted tabular-nums">
                  {(r.durationMs / 1000).toFixed(1)}s · {r.frames.length}f · {r.hand[0].toUpperCase()}
                </span>
                <span className="ml-auto flex gap-1 opacity-70 transition group-hover:opacity-100">
                  <IconButton
                    label={p.replayingId === r.id ? "Replaying" : "Replay through the detector"}
                    onClick={() => p.onReplay(r)}
                    d="M7 5l12 7-12 7z"
                    active={p.replayingId === r.id}
                  />
                  <IconButton label="Download" onClick={() => downloadJson(recordingFilename(r), r)} d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" />
                  <IconButton label="Delete" onClick={() => p.onDelete(r.id)} d="M6 7h12M9 7V5h6v2m-8 0l1 12h8l1-12" />
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={downloadAll} className="flex-1 rounded-xl border border-line py-2 text-xs font-semibold hover:border-cream/30">
              Download all ({p.recordings.length})
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmClear) {
                  p.onClear();
                  setConfirmClear(false);
                } else setConfirmClear(true);
              }}
              onBlur={() => setConfirmClear(false)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${confirmClear ? "bg-bad text-ink" : "text-muted hover:text-bad"}`}
            >
              {confirmClear ? "Confirm clear" : "Clear"}
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}

function Progress({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = Math.min(1, value / target);
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-muted">
        <span>{label}</span>
        <span className="font-mono tabular-nums">
          {value}/{target}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full transition-[width] duration-500 ${pct >= 1 ? "bg-good" : "bg-hoop"}`} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

function IconButton({ label, onClick, d, active }: { label: string; onClick: () => void; d: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid size-6 place-items-center rounded-md hover:bg-white/10 ${active ? "bg-hoop text-cream" : ""}`}
    >
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
    </button>
  );
}
