import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { CourtPreview } from "@/components/ui/CourtPreview";
import { COURT_THEME_ORDER, COURT_THEMES } from "@/lib/game/courts";
import { Reveal } from "./Reveal";

/** The five courts, drawn by the game itself, with a "join a room" card in the middle. */
export function CourtsRow() {
  const courts = COURT_THEME_ORDER.map((id) => ({ ...COURT_THEMES[id], id }));
  const card = (c: (typeof courts)[number]) => (
    <article key={c.id} className="relative aspect-[4/4.6] w-56 shrink-0 snap-start overflow-hidden rounded-2xl bg-ink lg:w-auto">
      <CourtPreview theme={c.id} className="absolute inset-0 size-full" />
      <div className="absolute inset-x-2 bottom-2 rounded-xl bg-ink/55 px-3 py-2 text-center text-cream backdrop-blur-md">
        <h3 className="text-base leading-tight">{c.name}</h3>
        <p className="truncate text-[10px] text-cream/65">{c.blurb}</p>
      </div>
    </article>
  );

  return (
    <section className="py-14 sm:py-20">
      <Reveal className="px-5 text-center">
        <h2 className="display text-[clamp(1.9rem,3.6vw,2.6rem)]">Pick your court</h2>
        <p className="mt-2 text-xs text-stone">Five scenes, each drawn live by the game. Switch any time from the start menu.</p>
      </Reveal>
      <div className="no-scrollbar mx-auto mt-8 flex max-w-7xl snap-x snap-mandatory gap-3 overflow-x-auto px-3 sm:px-5 lg:grid lg:grid-cols-6 lg:overflow-visible">
        {courts.slice(0, 2).map(card)}
        <Link
          href="/multiplayer"
          className="group flex aspect-[4/4.6] w-56 shrink-0 snap-start flex-col items-center justify-center gap-5 rounded-2xl bg-hoop p-5 text-center text-cream lg:w-auto"
        >
          <span className="text-lg leading-snug">
            Join a room
            <br />
            with friends
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-cream/50 px-4 py-1.5 text-xs transition group-hover:bg-cream group-hover:text-hoop">
            Join now <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} />
          </span>
        </Link>
        {courts.slice(2).map(card)}
      </div>
    </section>
  );
}
