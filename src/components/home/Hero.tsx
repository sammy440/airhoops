"use client";

import { Calendar03Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { PHOTOS } from "@/lib/images";
import { BallIcon } from "@/components/ui/Logo";
import { ArrowLink, IconLink } from "@/components/ui/Pills";
import { SiteNav } from "./SiteNav";

const EASE = [0.2, 0.8, 0.2, 1] as const;

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  // Parallax: the photo drifts and zooms slower than the page.
  const imgScale = useTransform(scrollYProgress, [0, 1], [1, 1.15]);
  const imgY = useTransform(scrollYProgress, [0, 1], ["0%", "10%"]);

  return (
    <section ref={ref} className="p-2 sm:p-3">
      <div className="relative flex h-[calc(100svh-1rem)] min-h-[600px] flex-col overflow-hidden rounded-[1.75rem] bg-ink sm:h-[calc(100svh-1.5rem)] sm:rounded-[2rem]">
        <motion.div className="absolute inset-0" style={{ scale: imgScale, y: imgY }}>
          <Image src={PHOTOS.hero.src} alt={PHOTOS.hero.alt} placeholder="blur" fill priority sizes="100vw" className="object-cover object-[32%_40%]" />
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-b from-ink/45 via-transparent to-ink/70" />
        <div className="absolute inset-0 bg-gradient-to-tr from-hoop/45 via-transparent to-transparent mix-blend-multiply" />

        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }}>
          <SiteNav tone="light" />
        </motion.div>

        {/* Watermark, like a club crest on the court */}
        <div aria-hidden className="pointer-events-none absolute top-1/2 right-6 hidden -translate-y-1/2 items-center gap-4 text-cream/45 lg:flex">
          <BallIcon className="size-20 opacity-60 grayscale" />
          <span className="text-5xl leading-[0.95] font-semibold tracking-[0.18em]">
            AIR
            <br />
            HOOPS
          </span>
        </div>

        <div className="relative z-10 mt-auto flex flex-col gap-6 p-5 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 0.3 }}>
            <h1 className="display max-w-[14ch] text-[clamp(2.6rem,6.4vw,5.5rem)] text-cream">Shoot hoops with nothing but air</h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-cream/80">
              Mime the throw and watch the ball fly. A basketball game you play with your body, right in your browser.
            </p>
            <ArrowLink href="/play" tone="light" className="mt-6">
              Start shooting
            </ArrowLink>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.5 }}
            className="hidden w-60 rounded-2xl bg-card p-4 text-ink shadow-xl sm:block"
          >
            <p className="text-sm leading-snug font-medium">
              Today&apos;s challenge
              <br />
              <span className="text-stone">Same shots for everyone</span>
            </p>
            <div className="mt-4 flex items-center gap-2">
              <IconLink href="/play" icon={Calendar03Icon} label="Play today's challenge" tone="dark" size={36} />
              <IconLink href="/multiplayer" icon={UserGroupIcon} label="Play with friends" size={36} />
              <span className="ml-auto text-[11px] text-stone">
                <HugeiconsIcon icon={Calendar03Icon} size={12} className="mr-1 inline" />
                New daily
              </span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
