"use client";

import { Add01Icon, MinusSignIcon, Settings02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { clampTimedSeconds, CUSTOM_MINUTES, formatDuration, isPresetDuration, TIMED_OPTIONS } from "@/lib/game/modes";
import { IconButton } from "./Pills";

/**
 * Preset clocks plus a "Custom" chip that reveals a 1–30 minute stepper: the solo shot clock and
 * the multiplayer race length (the API accepts the same set, see match.py).
 */
export function ShotClockPicker({ seconds, onChange, label, className = "" }: { seconds: number; onChange: (s: number) => void; label: string; className?: string }) {
  const [picked, setPicked] = useState(false);
  // Custom when chosen here, or when the clock is already one the presets don't have (a room's host set it)
  const custom = picked || !isPresetDuration(seconds);
  const minutes = Math.round(seconds / 60);
  const setMinutes = (m: number) => onChange(clampTimedSeconds(m * 60));
  const chip = (on: boolean) => `rounded-full py-2 font-mono text-xs transition ${on ? "bg-ink text-cream" : "text-ink/65 hover:text-ink"}`;

  return (
    <div className={className}>
      <div className="grid grid-cols-5 gap-1 rounded-full bg-card p-1" role="radiogroup" aria-label={label}>
        {TIMED_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={!custom && s === seconds}
            onClick={() => {
              setPicked(false);
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
          aria-label="Custom"
          title="Custom length"
          onClick={() => {
            setPicked(true);
            // Start from a duration the presets don't already cover.
            if (isPresetDuration(seconds)) onChange(180);
          }}
          className={`grid place-items-center ${chip(custom)}`}
        >
          <HugeiconsIcon icon={Settings02Icon} size={14} />
        </button>
      </div>
      {custom && (
        <div className="mt-2 flex items-center justify-end gap-2">
          <IconButton icon={MinusSignIcon} label="One minute less" onClick={() => setMinutes(minutes - 1)} disabled={minutes <= CUSTOM_MINUTES.min} size={34} />
          <input
            type="number"
            inputMode="numeric"
            aria-label={`Custom ${label.toLowerCase()} in minutes`}
            min={CUSTOM_MINUTES.min}
            max={CUSTOM_MINUTES.max}
            step={1}
            value={minutes}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (e.target.value !== "" && Number.isFinite(v)) setMinutes(v);
            }}
            className="w-16 rounded-full bg-card px-2 py-1.5 text-center font-mono text-base outline-none focus:ring-2 focus:ring-ink sm:text-sm"
          />
          <IconButton icon={Add01Icon} label="One minute more" onClick={() => setMinutes(minutes + 1)} disabled={minutes >= CUSTOM_MINUTES.max} size={34} />
          <span className="text-[11px] text-stone">min</span>
        </div>
      )}
    </div>
  );
}
