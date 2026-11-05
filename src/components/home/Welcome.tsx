"use client";

import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { PhotoKey } from "@/lib/images";
import { ArrowLink, IconLink, Tag } from "@/components/ui/Pills";
import { ArrowButtons } from "./ArrowButtons";
import { Photo } from "./Photo";
import { Reveal } from "./Reveal";

const SPOTS: { tag: string; caption: string; note: string; photo: PhotoKey; href: string }[] = [
  { tag: "Solo", caption: "Free play", note: "No clock, no pressure. Warm up and find your release.", photo: "stepSwish", href: "/play" },
  { tag: "Friends", caption: "Private rooms", note: "Send a code, shoot head to head. The server keeps score.", photo: "mode1v1", href: "/multiplayer" },
  { tag: "Daily", caption: "Today's challenge", note: "The same shots and wind for everyone. Your best run counts.", photo: "sunsetHoop", href: "/play" },
];

/** Welcome row: a photo card, a short intro, and a card that cycles through ways to play. */
export function Welcome() {
  const [i, setI] = useState(0);
  const go = (d: number) => setI((v) => (v + d + SPOTS.length) % SPOTS.length);
  const s = SPOTS[i];

  return (
    <section className="mx-auto grid w-full max-w-7xl gap-4 px-3 py-14 sm:px-5 sm:py-20 md:grid-cols-[1fr_1.1fr_1fr] md:gap-8">
      <Reveal>
        <div className="relative aspect-[4/3.6] overflow-hidden rounded-3xl">
          <Photo photo="enjoyGame" sizes="(min-width: 768px) 30vw, 100vw" className="absolute inset-0" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-transparent" />
          <Tag tone="glass" className="absolute top-3 left-3">
            Any room
          </Tag>
          <p className="absolute bottom-4 left-4 max-w-[12rem] text-sm leading-snug text-cream">A webcam and a little space is the whole court</p>
          <IconLink href="/how-to-play" icon={ArrowUpRight01Icon} label="How to set up" tone="dark" size={38} className="absolute right-3 bottom-3" />
        </div>
      </Reveal>

      <Reveal delay={100} className="flex flex-col justify-between gap-8 py-2">
        <div>
          <Tag>Basketball, reimagined</Tag>
          <p className="display mt-4 text-[clamp(1.5rem,2.4vw,2rem)] leading-[1.15]">
            Welcome to AirHoops, where your arms are the controller and every room becomes a court.
          </p>
          <ArrowLink href="/how-to-play" size="sm" className="mt-6">
            How to play
          </ArrowLink>
        </div>
        <ArrowButtons onPrev={() => go(-1)} onNext={() => go(1)} className="md:self-end" />
      </Reveal>

      <Reveal delay={200}>
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-sand">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={s.photo} className="absolute inset-0" initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
              <Photo photo={s.photo} sizes="(min-width: 768px) 30vw, 100vw" className="absolute inset-0" />
            </motion.div>
          </AnimatePresence>
          <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-transparent to-transparent" />
          <Tag tone="glass" className="absolute top-3 left-3">
            {s.tag}
          </Tag>
          <p className="absolute bottom-4 left-4 text-lg text-cream">{s.caption}</p>
          <IconLink href={s.href} icon={ArrowUpRight01Icon} label={`Play: ${s.caption}`} tone="light" size={38} className="absolute right-3 bottom-3" />
        </div>
        <p className="mt-3 max-w-xs text-xs leading-relaxed text-stone" aria-live="polite">
          {s.note}
        </p>
      </Reveal>
    </section>
  );
}
