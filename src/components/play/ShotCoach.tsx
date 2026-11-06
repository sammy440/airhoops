import { WhistleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { MIN_SHOTS, type CoachReport } from "@/lib/game/coach";
import { DEFAULT_COURT } from "@/lib/game/physics";
import type { MissKind } from "@/lib/game/physics";

/** Half the chart's width, metres: a shot further off sits on its edge. */
const REACH = 1.1;
const RIM = DEFAULT_COURT.rimRadius;
const BOARD = RIM + DEFAULT_COURT.boardGap;
const MISS_NAMES: Record<MissKind, string> = { short: "Short", long: "Long", left: "Left", right: "Right", rim: "Rim out", airball: "Airball" };
const clampReach = (v: number) => Math.max(-REACH + 0.06, Math.min(REACH - 0.06, v));

/**
 * Where every shot of the run came down, seen from above (the shooter at the bottom),
 * with the habit it shows and what to do about it.
 */
export function ShotCoach({ report, className = "" }: { report: CoachReport; className?: string }) {
  const { tips, marks } = report;
  const misses = (Object.entries(report.misses) as [MissKind, number][]).sort((a, b) => b[1] - a[1]);

  return (
    <section aria-label="Coach" className={`rounded-[1.5rem] bg-card p-4 ${className}`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="grid size-7 place-items-center rounded-full bg-ink text-cream">
          <HugeiconsIcon icon={WhistleIcon} size={15} strokeWidth={1.8} />
        </span>
        Coach
      </div>

      <div className="mt-3 grid grid-cols-[7.5rem_1fr] gap-4">
        <svg viewBox={`${-REACH} ${-REACH} ${REACH * 2} ${REACH * 2}`} className="aspect-square w-full rounded-2xl bg-cream" role="img" aria-label={`Shot chart: ${report.makes} of ${report.shots} in`}>
          {/* The board behind the rim, the rim, and the lane back to the shooter */}
          <line x1={-0.45} x2={0.45} y1={-BOARD} y2={-BOARD} stroke="currentColor" strokeOpacity={0.35} strokeWidth={0.04} strokeLinecap="round" />
          <line x1={0} x2={0} y1={RIM} y2={REACH} stroke="currentColor" strokeOpacity={0.12} strokeWidth={0.015} strokeDasharray="0.05 0.05" />
          <circle r={RIM} fill="none" className="text-hoop" stroke="currentColor" strokeWidth={0.035} />
          {marks.map((m, i) =>
            m.made ? (
              <circle key={i} cx={clampReach(m.x)} cy={clampReach(-m.y)} r={0.055} className={m.swish ? "fill-good" : "fill-court"} />
            ) : (
              <g key={i} transform={`translate(${clampReach(m.x)} ${clampReach(-m.y)})`} className="stroke-bad" strokeWidth={0.03} strokeLinecap="round">
                <line x1={-0.045} y1={-0.045} x2={0.045} y2={0.045} />
                <line x1={-0.045} y1={0.045} x2={0.045} y2={-0.045} />
              </g>
            ),
          )}
        </svg>

        <div className="min-w-0">
          {report.shots < MIN_SHOTS ? (
            <p className="text-sm text-stone">Take a few more shots and I&apos;ll spot what to work on.</p>
          ) : tips.length === 0 ? (
            <p className="text-sm text-stone">No clear habit this run. Keep shooting.</p>
          ) : (
            <ol className="space-y-2.5">
              {tips.map((t) => (
                <li key={t.id}>
                  <p className="text-sm leading-snug font-medium">{t.title}</p>
                  <p className="mt-0.5 text-xs leading-snug text-stone">{t.body}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {misses.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Misses">
          {misses.map(([kind, n]) => (
            <li key={kind} className="rounded-full border border-ink/10 px-2.5 py-1 text-[11px] leading-none text-ink/75">
              {MISS_NAMES[kind]} <span className="font-mono tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
