"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowButtons } from "./ArrowButtons";
import { Crop, type FOCUS } from "./Crop";

const MODES: { name: string; tag: string; body: string; focus: keyof typeof FOCUS; zoom: number }[] = [
  { name: "Free Play", tag: "Solo", body: "No clock, no pressure. Warm up, find your release and learn the arc.", focus: "swish", zoom: 1.4 },
  { name: "60-Second Timed", tag: "Solo", body: "One minute on the clock. Shoot fast, shoot clean, chase your best.", focus: "ball", zoom: 2.2 },
  { name: "King of the Court", tag: "Streak", body: "Every make builds your multiplier. One miss and the crown resets.", focus: "net", zoom: 1.8 },
  { name: "1v1 Shootout", tag: "Multiplayer", body: "Five shots each, sudden death on ties. The server keeps it honest.", focus: "rim", zoom: 2 },
  { name: "Timed Race", tag: "Multiplayer", body: "Everyone shoots at once for 60 seconds. Highest score takes it.", focus: "backboard", zoom: 1.8 },
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
        <div className="flex items-end justify-center gap-3 px-2 sm:gap-5">
          {visible.map(({ off, idx }) => {
            const m = MODES[idx];
            const isActive = off === 0;
            const far = Math.abs(off) === 2;
            return (
              <button
                key={`${idx}-${off}`}
                type="button"
                onClick={() => go(off)}
                aria-label={m.name}
                className={`relative shrink-0 overflow-hidden rounded-2xl transition-all duration-500 ${
                  isActive
                    ? "z-10 w-[64vw] max-w-[300px] -translate-y-6 shadow-[0_30px_60px_-20px_rgba(14,14,13,.5)]"
                    : far
                      ? "hidden w-[16vw] max-w-[220px] opacity-60 md:block"
                      : "w-[30vw] max-w-[260px] opacity-90 hover:opacity-100"
                }`}
              >
                <Crop focus={m.focus} zoom={m.zoom} sizes="300px" className={isActive ? "aspect-[3/4]" : "aspect-[4/5]"} />
                {isActive && (
                  <div className="absolute inset-x-3 bottom-3 rounded-xl bg-cream p-4 text-left text-ink">
                    <span className="text-[10px] font-bold tracking-[0.14em] text-hoop uppercase">{m.tag}</span>
                    <h3 className="mt-1 text-lg leading-tight font-semibold">{m.name}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-stone">{m.body}</p>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="pointer-events-none relative z-20 mx-auto mt-2 flex max-w-7xl items-end justify-between px-5 sm:-mt-24 sm:px-8">
          <span className="display text-6xl text-hoop sm:text-8xl">Shoot &amp; Go</span>
          <span className="display text-6xl text-hoop sm:text-8xl">Modes</span>
        </div>
        <div className="mt-6 flex justify-center gap-1.5" aria-hidden>
          {MODES.map((m, i) => (
            <span key={m.name} className={`h-1.5 rounded-full transition-all ${i === active ? "w-6 bg-hoop" : "w-1.5 bg-ink/20"}`} />
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-stone">
          Modes unlock as we build them. <Link href="/lab" className="font-semibold text-ink underline underline-offset-4 hover:text-hoop">Try the tracker today</Link>
        </p>
      </div>
    </div>
  );
}
