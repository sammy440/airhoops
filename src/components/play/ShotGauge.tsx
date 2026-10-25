import type { ShotResult } from "@/lib/game/physics";

export interface LastShot {
  power: number;
  angle: number;
  input: "camera" | "keys";
  result: ShotResult;
  window: { lo: number; hi: number } | null;
}

/** Post-shot coaching: your power vs. the make zone at the angle you threw. */
export function ShotGauge({ shot }: { shot: LastShot }) {
  const { power, window: w, result } = shot;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const center = w ? (w.lo + w.hi) / 2 : null;

  let tip: string;
  if (result.scored) tip = result.swish ? "Nothing but net. Do that again." : "Bucket! Aim for the middle of the zone to swish.";
  else if (!w) tip = "That arc can't reach. Raise your hands higher at release.";
  else if (power < w.lo) tip = `Short. Push about ${pct(w.lo - power + 0.02)} harder.`;
  else if (power > w.hi) tip = `Long. Ease off about ${pct(power - w.hi + 0.02)}.`;
  else tip = "Right power, unlucky roll. Same again!";

  return (
    <div className="glass w-[min(92vw,420px)] rounded-2xl px-4 py-3">
      <div className="flex items-baseline justify-between text-[11px] tracking-[0.12em] text-cream/60 uppercase">
        <span>Your power {pct(power)}</span>
        <span>
          {shot.input === "keys" ? "keyboard" : "camera"} · {shot.angle.toFixed(0)}°
        </span>
      </div>
      <div className="relative mt-2 h-3 rounded-full bg-white/10">
        {w && (
          <div
            className="absolute inset-y-0 rounded-full bg-good/50 ring-1 ring-good"
            style={{ left: `${w.lo * 100}%`, width: `${Math.max(1, (w.hi - w.lo) * 100)}%` }}
            title={`Make zone ${pct(w.lo)}–${pct(w.hi)}`}
          />
        )}
        {center !== null && <div className="absolute inset-y-0 w-px bg-good" style={{ left: `${center * 100}%` }} />}
        <div
          className={`absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink ${result.scored ? "bg-good" : "bg-hoop"}`}
          style={{ left: `${Math.min(1, Math.max(0, power)) * 100}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-cream">{tip}</p>
    </div>
  );
}
