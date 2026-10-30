"use client";

import type { RaiseHandState } from "@/lib/pose/raiseHandDetector";

const R = 9;
const CIRC = 2 * Math.PI * R;

/**
 * "✋ Raise a hand to …" pill with a ring that fills while the hand is held up.
 * Sits above the screens' dialogs (z-40) so it works on any of them.
 */
export function RaiseHandHint({ label, state, both }: { label: string; state: RaiseHandState; both?: boolean }) {
  const holding = state.progress > 0;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 sm:bottom-6">
      <div
        className={`glass flex items-center gap-2.5 rounded-full py-1.5 pr-4 pl-1.5 text-xs transition ${holding ? "text-cream" : "text-cream/70"}`}
        aria-live="polite"
      >
        <svg viewBox="0 0 24 24" className="size-7 -rotate-90" aria-hidden>
          <circle cx="12" cy="12" r={R} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth="2.5" />
          <circle
            cx="12"
            cy="12"
            r={R}
            fill="none"
            className="stroke-sun"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - state.progress)}
            style={{ transition: holding ? "stroke-dashoffset 100ms linear" : "none" }}
          />
          <text x="12" y="12" transform="rotate(90 12 12)" textAnchor="middle" dominantBaseline="central" fontSize="10">
            {both ? "🙌" : "✋"}
          </text>
        </svg>
        <span>
          {both ? "Raise both hands" : "Raise a hand"} to <strong className="font-semibold text-cream">{label}</strong>
        </span>
      </div>
    </div>
  );
}
