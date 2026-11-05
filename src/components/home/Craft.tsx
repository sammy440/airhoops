import { Add01Icon, ArrowUpRight01Icon, Target02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { IconLink } from "@/components/ui/Pills";
import { Photo } from "./Photo";
import { Reveal } from "./Reveal";

/** A ring that's mostly full: 33 landmarks tracked each frame. */
function Ring() {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 120 120" className="size-28" aria-hidden>
      <defs>
        <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-hoop-soft)" stopOpacity=".25" />
          <stop offset="100%" stopColor="var(--color-hoop)" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-sand)" strokeWidth="10" />
      <circle cx="60" cy="60" r={r} fill="none" stroke="url(#ring-g)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${c * 0.82} ${c}`} transform="rotate(-90 60 60)" />
      <circle cx="60" cy="14" r="5" fill="var(--color-hoop)" transform={`rotate(${0.82 * 360} 60 60)`} />
      <text x="60" y="62" textAnchor="middle" fontSize="20" fontWeight="600" fill="var(--color-ink)">
        33
      </text>
      <text x="60" y="76" textAnchor="middle" fontSize="7" fill="var(--color-stone)">
        landmarks
      </text>
    </svg>
  );
}

/** "Built for every throw": the tech, said with pictures and a sentence. */
export function Craft() {
  return (
    <section className="overflow-x-clip py-14 sm:py-20">
      <div className="mx-auto max-w-7xl px-3 sm:px-5">
        <Reveal>
          <h2 className="display max-w-2xl text-[clamp(2rem,4vw,3rem)] leading-[1.08]">We built it to make every throw count</h2>
        </Reveal>

        <div className="mt-8 grid gap-4 md:grid-cols-[1.45fr_0.75fr_1.1fr]">
          <Reveal className="relative aspect-[16/11] overflow-hidden rounded-3xl md:row-span-2">
            <Photo photo="airDunk" sizes="(min-width: 768px) 45vw, 100vw" className="absolute inset-0" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
            <span className="absolute top-4 left-4 grid size-10 place-items-center rounded-full border border-white/40 text-cream backdrop-blur-sm">
              <HugeiconsIcon icon={Target02Icon} size={18} />
            </span>
            <div className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-4 text-cream">
              <div>
                <p className="display text-[clamp(2.4rem,5vw,3.75rem)]">Physics</p>
                <p className="mt-1 max-w-[16rem] text-xs text-cream/75">Real ball flight, the same on every screen in a match</p>
              </div>
              <IconLink href="/play" icon={ArrowUpRight01Icon} label="Try a shot" tone="light" size={48} />
            </div>
          </Reveal>

          <Reveal delay={80} className="flex flex-col items-start justify-between gap-4 rounded-3xl bg-card p-5">
            <Ring />
            <p className="text-base leading-snug">Full-body tracking, every frame</p>
          </Reveal>

          <Reveal delay={160} className="relative min-h-44 overflow-hidden rounded-3xl">
            <Photo photo="stepSwish" sizes="(min-width: 768px) 25vw, 100vw" className="absolute inset-0" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent" />
            <span className="absolute top-4 left-4 grid size-9 place-items-center rounded-full border border-white/40 text-cream">
              <HugeiconsIcon icon={Add01Icon} size={16} />
            </span>
            <p className="absolute bottom-4 left-4 text-lg leading-tight text-cream">
              Swish and bank
              <br />
              bonuses
            </p>
          </Reveal>

          <Reveal delay={200} className="flex items-center md:col-span-2">
            <p className="display max-w-xl text-[clamp(1.35rem,2.2vw,1.75rem)] leading-[1.35]">
              Providing <span className="mark">on-device</span> tracking that helps every player find their <span className="mark">release</span> and keep it
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
