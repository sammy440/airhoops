"use client";

import { Share08Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { PhotoKey } from "@/lib/images";
import { siteUrl } from "@/lib/share";
import { BallIcon } from "@/components/ui/Logo";
import { ArrowLink } from "@/components/ui/Pills";
import { ArrowButtons } from "./ArrowButtons";
import { Photo } from "./Photo";
import { Reveal } from "./Reveal";

type Group = "Solo" | "Friends" | "Daily";

const MODES: { name: string; group: Group; body: string; photo: PhotoKey; href: string }[] = [
  { name: "Free play", group: "Solo", body: "No clock, no pressure. Warm up, find your release and learn the arc.", photo: "modeFree", href: "/play" },
  { name: "Timed", group: "Solo", body: "30 seconds to 30 minutes on the clock. Shoot fast, shoot clean, chase your best.", photo: "modeTimed", href: "/play" },
  { name: "Streak", group: "Solo", body: "Keep making them. Every make builds the run; one miss and it's over.", photo: "modeKing", href: "/play" },
  { name: "Daily challenge", group: "Daily", body: "The same difficulty, clock and wind for everyone today. Your best run counts.", photo: "sunsetHoop", href: "/play" },
  { name: "1v1 Shootout", group: "Friends", body: "Five shots each, sudden death on ties. The server keeps it honest.", photo: "mode1v1", href: "/multiplayer" },
  { name: "Race", group: "Friends", body: "Everyone shoots at once against the buzzer. Highest score takes it.", photo: "modeRace", href: "/multiplayer" },
  { name: "H-O-R-S-E", group: "Friends", body: "Call your shot. Miss a matched shot and you take a letter.", photo: "jumpLeap", href: "/multiplayer" },
];
const GROUPS: Group[] = ["Solo", "Friends", "Daily"];

/** Every mode, one at a time, on a clay card; the tags jump between solo, friends and daily. */
export function ModesShowcase() {
  const [i, setI] = useState(0);
  const [copied, setCopied] = useState(false);
  const n = MODES.length;
  const go = (d: number) => setI((v) => (v + d + n) % n);
  const m = MODES[i];

  const invite = async () => {
    const url = `${siteUrl()}/multiplayer`;
    try {
      if (navigator.share) await navigator.share({ title: "AirHoops", text: "Shoot hoops with me 🏀", url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* dismissed */
    }
  };

  return (
    <section className="mx-auto w-full max-w-7xl border-t border-rule px-3 py-14 sm:px-5 sm:py-20">
      <span className="grid size-14 place-items-center rounded-full bg-ink">
        <BallIcon className="size-7" />
      </span>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-12">
        <Reveal className="flex flex-col justify-between gap-10">
          <div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Kind of game">
              {GROUPS.map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={m.group === g}
                  onClick={() => setI(MODES.findIndex((x) => x.group === g))}
                  className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${m.group === g ? "border-ink bg-ink text-cream" : "border-ink/15 text-ink/75 hover:border-ink"}`}
                >
                  {g}
                </button>
              ))}
            </div>
            <h2 className="display mt-6 text-[clamp(2.4rem,5vw,3.75rem)]">Every mode, one court, and your arms</h2>
          </div>

          <div className="relative w-full max-w-xs rounded-2xl bg-ink p-4 text-cream">
            <p className="text-sm">Bring a friend</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <button type="button" onClick={invite} className="inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-white">
                <HugeiconsIcon icon={copied ? Tick02Icon : Share08Icon} size={14} />
                {copied ? "Copied" : "Share link"}
              </button>
              <span className="flex -space-x-2" aria-hidden>
                {["bg-hoop", "bg-court", "bg-sun", "bg-cream"].map((c) => (
                  <span key={c} className={`grid size-7 place-items-center rounded-full ring-2 ring-ink ${c}`}>
                    <BallIcon className="size-3.5 opacity-80" />
                  </span>
                ))}
              </span>
            </div>
            {/* The pointer from the reference: a little clay cursor */}
            <svg viewBox="0 0 24 24" className="absolute -bottom-4 left-12 size-6 rotate-[-20deg] text-hoop drop-shadow" aria-hidden>
              <path d="M3 2l18 8-8 2.5L10 21z" fill="currentColor" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="rounded-[1.75rem] bg-hoop p-3 text-cream sm:p-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={m.name}
                className="grid gap-5 sm:grid-cols-[0.9fr_1fr]"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.35 }}
              >
                <Photo photo={m.photo} sizes="(min-width: 1024px) 26vw, 90vw" className="aspect-[4/3.4] rounded-2xl sm:aspect-[4/4.4]" />
                <div className="flex flex-col p-2 sm:py-4">
                  <span className="text-xs text-cream/70">{m.group}</span>
                  <h3 className="display mt-1 text-3xl">{m.name}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-cream/80">{m.body}</p>
                  <ArrowLink href={m.href} tone="light" size="sm" className="mt-6 self-start">
                    Play
                  </ArrowLink>
                  <span className="mt-auto pt-6 text-right font-mono text-xs text-cream/70">
                    {i + 1} / <span className="text-cream/45">{n}</span>
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
          <ArrowButtons onPrev={() => go(-1)} onNext={() => go(1)} className="mt-4 justify-end" />
        </Reveal>
      </div>
    </section>
  );
}
