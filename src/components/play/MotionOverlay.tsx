import type { MotionReadout } from "@/hooks/useThrowInput";
import type { ThrowParams } from "@/lib/pose/throwDetector";

/** Top of the push meter, in torso lengths/s. */
const METER_MAX = 5;

/**
 * Live throwing-arm numbers over the camera preview, plus a vertical "push
 * meter": fill = current wrist speed, ticks = the detector's start and
 * minimum-throw speeds, so players see how hard a shot has to be.
 */
export function MotionOverlay({ motion, thresholds }: { motion: MotionReadout | null; thresholds: ThrowParams }) {
  const pct = (v: number) => `${Math.min(100, (v / METER_MAX) * 100)}%`;
  const speed = motion?.speed ?? 0;
  const fast = speed >= thresholds.startSpeed;

  return (
    <>
      {/* Push meter */}
      <div className="absolute top-2 right-2 bottom-9 w-2 overflow-visible rounded-full bg-white/15" aria-hidden>
        <div
          className={`absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-100 ${fast ? "bg-hoop" : "bg-cream/70"}`}
          style={{ height: pct(speed) }}
        />
        {motion && <div className="absolute -inset-x-1 h-0.5 rounded bg-[#ffe14d]" style={{ bottom: pct(motion.peak) }} title="Peak (1.5 s)" />}
        {[
          { v: thresholds.startSpeed, label: "go" },
          { v: thresholds.minPeakSpeed, label: "shot" },
        ].map((m) => (
          <div key={m.label} className="absolute right-full flex items-center" style={{ bottom: pct(m.v) }}>
            <span className="mr-1 hidden font-mono text-[8px] tracking-wide text-cream/60 uppercase sm:inline">{m.label}</span>
            <span className="h-px w-2 bg-cream/60" />
          </div>
        ))}
      </div>

      {/* Numbers */}
      <div className="absolute inset-x-0 bottom-0 flex items-end gap-1 bg-gradient-to-t from-black/80 to-transparent px-2 pt-6 pb-1.5 font-mono text-[9px] leading-tight text-cream sm:gap-1.5 sm:text-[10px]">
        <Metric label="speed" value={motion ? motion.speed.toFixed(1) : "–"} unit="t/s" hot={fast} />
        <Metric label="peak" value={motion ? motion.peak.toFixed(1) : "–"} unit="t/s" className="hidden sm:flex" />
        <Metric label="angle" value={motion ? `${motion.angle.toFixed(0)}°` : "–"} />
        <Metric label="reach" value={motion ? motion.extension.toFixed(2) : "–"} className="hidden sm:flex" />
        <span className="ml-auto mr-3 rounded bg-white/15 px-1 py-0.5 tracking-wide uppercase">{motion ? `${motion.hand[0]} hand` : "no arm"}</span>
      </div>
    </>
  );
}

function Metric({ label, value, unit, hot, className = "" }: { label: string; value: string; unit?: string; hot?: boolean; className?: string }) {
  return (
    <span className={`flex flex-col rounded bg-black/40 px-1.5 py-0.5 ${className}`}>
      <span className="text-[8px] tracking-wider text-cream/55 uppercase">{label}</span>
      <span className={`tabular-nums ${hot ? "text-hoop-soft" : ""}`}>
        {value}
        {unit && <span className="ml-0.5 text-cream/50">{unit}</span>}
      </span>
    </span>
  );
}
