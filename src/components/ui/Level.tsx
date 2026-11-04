import Link from "next/link";
import { unlockedBetween } from "@/lib/game/cosmetics";
import { levelFor, levelProgress, MAX_LEVEL } from "@/lib/game/xp";

/** "Lv 7" pill. */
export function LevelChip({ level, className = "" }: { level: number; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full bg-sun/15 px-1.5 py-px font-mono text-[10px] font-bold text-sun tabular-nums ${className}`} title={`Level ${level}`}>
      Lv {level}
    </span>
  );
}

/** Progress through the current level. */
export function XpBar({ xp, className = "" }: { xp: number; className?: string }) {
  const p = levelProgress(xp);
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between text-[11px] text-cream/60">
        <span className="font-semibold text-cream">Level {p.level}</span>
        <span className="font-mono tabular-nums">{p.level >= MAX_LEVEL ? "Max level" : `${p.into} / ${p.needed} XP`}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Progress to the next level" aria-valuenow={Math.round(p.fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-sun transition-[width] duration-700" style={{ width: `${Math.round(p.fraction * 100)}%` }} />
      </div>
    </div>
  );
}

/** After a run or match: XP earned, the bar, and a level-up with what it unlocked. */
export function XpSummary({ before, after, className = "" }: { before: number; after: number; className?: string }) {
  const from = levelFor(before);
  const to = levelFor(after);
  const unlocks = unlockedBetween(from, to);
  return (
    <div className={`rounded-2xl bg-white/[0.04] px-4 py-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-sm font-bold text-sun">+{Math.max(0, after - before)} XP</span>
        {to > from && <span className="animate-count-pop rounded-full bg-sun px-2.5 py-0.5 text-xs font-bold text-ink">LEVEL {to}!</span>}
      </div>
      <XpBar xp={after} />
      {unlocks.length > 0 && (
        <p className="mt-2 text-xs text-cream/75">
          Unlocked: <b className="text-cream">{unlocks.join(", ")}</b>.{" "}
          <Link href="/profile#locker" className="text-hoop-soft underline underline-offset-2">
            Equip it
          </Link>
        </p>
      )}
    </div>
  );
}
