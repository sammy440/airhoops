"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Appear } from "@/components/motion/Appear";
import { SplitText } from "@/components/motion/SplitText";
import { ArrowButtons } from "./ArrowButtons";
import type { PhotoKey } from "@/lib/images";
import { Photo } from "./Photo";

const MODES: { name: string; tag: string; body: string; photo: PhotoKey }[] = [
  { name: "Free Play", tag: "Solo", body: "No clock, no pressure. Warm up, find your release and learn the arc.", photo: "modeFree" },
  { name: "Timed", tag: "Solo", body: "30 seconds to 30 minutes on the clock. Shoot fast, shoot clean, chase your best.", photo: "modeTimed" },
  { name: "King of the Court", tag: "Streak", body: "Every make builds your multiplier. One miss and the crown resets.", photo: "modeKing" },
  { name: "1v1 Shootout", tag: "Multiplayer", body: "Five shots each, sudden death on ties. The server keeps it honest.", photo: "mode1v1" },
  { name: "Timed Race", tag: "Multiplayer", body: "Everyone shoots at once against the buzzer. Highest score takes it.", photo: "modeRace" },
];

export function ModesShowcase() {
  const [active, setActive] = useState(2);
  const n = MODES.length;
  const go = (d: number) => setActive((a) => (a + d + n) % n);

  // Show the active mode in the middle with two neighbours either side.
  const visible = [-2, -1, 0, 1, 2].map((off) => ({ off, idx: (active + off + n) % n }));

  return (
    <div>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 sm:px-8">
        <p className="flex items-center gap-2 text-xs font-medium">
          <span className="size-1.5 rounded-full bg-ink" /> Game modes
        </p>
        <ArrowButtons onPrev={() => go(-1)} onNext={() => go(1)} />
      </div>

      <div className="relative mt-4 overflow-x-clip pt-6">
        <Appear from={{ y: 80 }} className="flex items-end justify-center gap-3 px-2 sm:gap-5">
          {visible.map(({ off, idx }) => {
            const m = MODES[idx];
            const isActive = off === 0;
            const far = Math.abs(off) === 2;
            return (
              // Keyed by mode (not slot) so each card glides to its new position.
              <motion.button
                key={idx}
                layout
                transition={{ type: "spring", stiffness: 140, damping: 22 }}
                style={{ borderRadius: 16 }}
                type="button"
                onClick={() => go(off)}
                aria-label={m.name}
                className={`relative shrink-0 overflow-hidden transition-opacity ${
                  isActive
                    ? "z-10 mb-6 w-[64vw] max-w-[300px] shadow-[0_30px_60px_-20px_rgba(14,14,13,.5)]"
                    : far
                      ? "hidden w-[16vw] max-w-[220px] opacity-60 md:block"
                      : "w-[30vw] max-w-[260px] opacity-90 hover:opacity-100"
                }`}
              >
                <motion.div layout>
                  <Photo photo={m.photo} sizes="300px" className={isActive ? "aspect-[3/4]" : "aspect-[4/5]"} />
                </motion.div>
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0, transition: { delay: 0.25, duration: 0.5 } }}
                      exit={{ opacity: 0, y: 12, transition: { duration: 0.15 } }}
                      className="absolute inset-x-3 bottom-3 rounded-xl bg-cream p-4 text-left text-ink"
                    >
                      <span className="text-[10px] font-bold tracking-[0.14em] text-hoop uppercase">{m.tag}</span>
                      <h3 className="mt-1 text-lg leading-tight font-semibold">{m.name}</h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-stone">{m.body}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </Appear>

        <div className="pointer-events-none relative z-20 mx-auto mt-2 flex max-w-7xl items-end justify-between px-5 sm:-mt-24 sm:px-8">
          <SplitText text="Shoot & Go" className="display text-[clamp(2.5rem,12vw,3.75rem)] text-hoop sm:text-8xl" />
          <SplitText text="Modes" delay={0.2} className="display text-[clamp(2.5rem,12vw,3.75rem)] text-hoop sm:text-8xl" />
        </div>
        <div className="mt-6 flex justify-center gap-1.5" aria-hidden>
          {MODES.map((m, i) => (
            <span key={m.name} className={`h-1.5 rounded-full transition-all ${i === active ? "w-6 bg-hoop" : "w-1.5 bg-ink/20"}`} />
          ))}
        </div>
        <p className="mt-6 px-5 text-center text-xs text-stone">
          Solo free play, timed and streak runs, plus shootouts and races with friends.{" "}
          <Link href="/play" className="font-semibold text-ink underline underline-offset-4 hover:text-hoop">
            Play now
          </Link>
        </p>
      </div>
    </div>
  );
}
