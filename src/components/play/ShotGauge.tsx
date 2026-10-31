import type { ShotResult } from "@/lib/game/physics";
import { DEFAULT_TUNING } from "@/lib/game/shot";

export interface LastShot {
  power: number;
  angle: number;
  /** Launch aim, degrees (+ = right) */
  aim: number;
  input: "camera" | "keys";
  result: ShotResult;
  /** Make zone for power, with the direction put right (null: no power reaches at this arc) */
  window: { lo: number; hi: number } | null;
  /** Aim that would have centred the shot on the rim, and how far either side still goes in */
  aimTarget: number;
  aimTolerance: number;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const MAX_AIM = DEFAULT_TUNING.maxAim;
/** Aim (degrees) → position along the direction bar */
const along = (deg: number) => `${((Math.max(-MAX_AIM, Math.min(MAX_AIM, deg)) + MAX_AIM) / (2 * MAX_AIM)) * 100}%`;

/** What to say about the shot: direction and distance, each only when it was off. */
export function shotTip(shot: LastShot): string {
  const { power, window: w, result } = shot;
  if (result.scored) return result.swish ? "Nothing but net. Do that again." : "Bucket! Aim for the middle of the zone to swish.";
  const off = shot.aim - shot.aimTarget; // + = too far right
  const wide = Math.abs(off) > shot.aimTolerance ? (off > 0 ? "right" : "left") : null;
  const fix = off > 0 ? "left" : "right";
  const steer =
    shot.input === "camera" ? `lean a little ${fix}` : `aim ${Math.max(1, Math.round(Math.abs(off)))}° ${fix} (${fix === "left" ? "←" : "→"})`;
  const distance = !w ? null : power < w.lo ? `push about ${pct(w.lo - power + 0.02)} harder` : power > w.hi ? `ease off about ${pct(power - w.hi + 0.02)}` : null;
  const how = !w ? null : power < w.lo ? "short" : power > w.hi ? "long" : null;

  if (!w) return `That arc can't reach. Raise your hands higher at release${wide ? `, and ${steer}` : ""}.`;
  if (wide && distance) return `Wide ${wide} and ${how}: ${steer} and ${distance}.`;
  if (wide) return `Wide ${wide}: ${steer}.`;
  if (distance) return `${how === "short" ? "Short" : "Long"}: ${distance}.`;
  return "Right power, right line, unlucky roll. Same again!";
}

/** Post-shot coaching: your power vs. the make zone, and your direction vs. where the rim was. */
export function ShotGauge({ shot }: { shot: LastShot }) {
  const { power, window: w, result } = shot;
  const center = w ? (w.lo + w.hi) / 2 : null;
  const dot = `absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink ${result.scored ? "bg-good" : "bg-hoop"}`;

  return (
    <div className="glass w-[min(92vw,420px)] rounded-2xl px-4 py-3">
      <div className="flex items-baseline justify-between text-[11px] tracking-[0.12em] text-cream/60 uppercase">
        <span>Your power {pct(power)}</span>
        <span>
          {shot.input === "keys" ? "manual" : "camera"} · {shot.angle.toFixed(0)}°
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
        <div className={dot} style={{ left: `${Math.min(1, Math.max(0, power)) * 100}%` }} />
      </div>

      <div className="mt-2.5 flex items-baseline justify-between text-[11px] tracking-[0.12em] text-cream/60 uppercase">
        <span>Direction</span>
        <span>{Math.abs(shot.aim) < 0.5 ? "straight" : `${Math.abs(shot.aim).toFixed(0)}° ${shot.aim > 0 ? "right" : "left"}`}</span>
      </div>
      <div className="relative mt-2 h-3 rounded-full bg-white/10" aria-hidden>
        <div className="absolute inset-y-0 left-1/2 w-px bg-cream/25" />
        <div
          className="absolute inset-y-0 rounded-full bg-good/50 ring-1 ring-good"
          style={{
            left: along(shot.aimTarget - shot.aimTolerance),
            width: `${((2 * shot.aimTolerance) / (2 * MAX_AIM)) * 100}%`,
          }}
          title="Where the rim was"
        />
        <div className={dot} style={{ left: along(shot.aim) }} />
      </div>
      <p className="mt-2 text-sm text-cream">{shotTip(shot)}</p>
    </div>
  );
}
