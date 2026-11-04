"use client";

import { XpBar } from "@/components/ui/Level";
import { useProgress } from "@/hooks/useProgress";
import { BALL_SKINS, TRAILS, trailColor, type BallSkin, type TrailSkin } from "@/lib/game/cosmetics";
import { setLoadout } from "@/lib/game/progress";

const rgb = ([r, g, b]: [number, number, number]) => `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;

/** Ball skins and trails, earned by levelling up. */
export function Locker() {
  const progress = useProgress();
  if (!progress) return null;
  const { level, chosen } = progress;
  return (
    <section id="locker" className="scroll-mt-6 rounded-3xl border border-cream/10 bg-white/[0.03] p-5 sm:p-6">
      <h2 className="display mb-1 text-2xl">Locker</h2>
      <p className="mb-4 text-xs text-cream/55">Level up by playing: every shot, make, streak, finished run and match earns XP.</p>
      <XpBar xp={progress.xp} />

      <div className="mt-5 mb-2 text-xs font-semibold tracking-[0.14em] text-cream/55 uppercase">Ball</div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Ball">
        {BALL_SKINS.map((s) => (
          <Item key={s.id} name={s.name} unlockAt={s.level} level={level} on={chosen.ball === s.id} onPick={() => setLoadout({ ...chosen, ball: s.id })}>
            <BallSwatch skin={s} />
          </Item>
        ))}
      </div>

      <div className="mt-5 mb-2 text-xs font-semibold tracking-[0.14em] text-cream/55 uppercase">Fire trail</div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Fire trail">
        {TRAILS.map((t) => (
          <Item key={t.id} name={t.name} unlockAt={t.level} level={level} on={chosen.trail === t.id} onPick={() => setLoadout({ ...chosen, trail: t.id })}>
            <TrailSwatch trail={t} />
          </Item>
        ))}
      </div>
    </section>
  );
}

function Item({ name, unlockAt, level, on, onPick, children }: { name: string; unlockAt: number; level: number; on: boolean; onPick: () => void; children: React.ReactNode }) {
  const locked = unlockAt > level;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on && !locked}
      aria-disabled={locked}
      disabled={locked}
      onClick={onPick}
      title={locked ? `${name}: unlocks at level ${unlockAt}` : name}
      className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-xs transition ${on && !locked ? "border-hoop bg-hoop/15" : "border-cream/10 hover:border-cream/30"} disabled:cursor-not-allowed disabled:hover:border-cream/10`}
    >
      <span className={locked ? "opacity-30 grayscale" : ""}>{children}</span>
      <span className={`font-semibold ${locked ? "text-cream/45" : ""}`}>{name}</span>
      {locked && <span className="font-mono text-[10px] text-sun">🔒 Lv {unlockAt}</span>}
    </button>
  );
}

function BallSwatch({ skin }: { skin: BallSkin }) {
  return (
    <svg viewBox="0 0 40 40" className="size-10" aria-hidden>
      <defs>
        <radialGradient id={`ball-${skin.id}`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor={skin.light} />
          <stop offset="0.55" stopColor={skin.base} />
          <stop offset="1" stopColor={skin.dark} />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="18" fill={`url(#ball-${skin.id})`} />
      <g fill="none" stroke={skin.seam} strokeWidth="1.6">
        <path d="M2 20h36M20 2v36" />
        <path d="M10 5q8 15 0 30M30 5q-8 15 0 30" />
      </g>
    </svg>
  );
}

function TrailSwatch({ trail }: { trail: TrailSkin }) {
  const stops = Array.from({ length: 6 }, (_, i) => rgb(trailColor(trail, i / 5, i * 3)));
  return <span className="block h-10 w-14 rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${stops.join(", ")})` }} />;
}
