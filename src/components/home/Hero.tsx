"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { PHOTOS } from "@/lib/images";
import { SplitText } from "@/components/motion/SplitText";
import { SiteNav } from "./SiteNav";

const EASE = [0.2, 0.8, 0.2, 1] as const;

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  // Parallax: the photo drifts and zooms slower than the page; the title sinks.
  const imgScale = useTransform(scrollYProgress, [0, 1], [1, 1.2]);
  const imgY = useTransform(scrollYProgress, [0, 1], ["0%", "14%"]);
  const titleY = useTransform(scrollYProgress, [0, 1], ["0%", "40%"]);
  const fade = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

  return (
    <section ref={ref} className="relative flex h-[100svh] min-h-[620px] flex-col overflow-hidden bg-ink">
      <motion.div className="absolute inset-0" style={{ scale: imgScale, y: imgY }}>
        <Image
          src={PHOTOS.hero.src}
          alt={PHOTOS.hero.alt}
          placeholder="blur"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[32%_40%]"
        />
      </motion.div>
      {/* Warm grade: dark top for the nav, sun-baked orange bottom for the title */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink/55 via-transparent to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-sun via-sun/60 to-transparent mix-blend-multiply" />
      <div className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-sun/90 to-transparent" />

      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }}>
        <SiteNav tone="light" />
      </motion.div>

      <motion.div style={{ opacity: fade }} className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-end px-5 sm:px-8">
        <motion.div
          className="mb-4 flex flex-col items-start gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.7 }}
        >
          <div className="max-w-xs">
            <p className="font-display text-lg tracking-wide text-hoop uppercase">/ Dream</p>
            <p className="mt-2 text-sm leading-relaxed font-medium text-cream/90">
              Mime the throw. Watch the ball fly. A basketball game controlled by nothing but your body.
            </p>
          </div>
          <Link
            href="/play"
            className="group flex items-center gap-3 rounded-full bg-ink py-2 pr-2 pl-5 text-sm font-semibold text-cream transition hover:bg-hoop"
          >
            Start shooting
            <span className="grid size-8 place-items-center rounded-full bg-cream text-ink transition group-hover:rotate-45">↗</span>
          </Link>
        </motion.div>
      </motion.div>

      <motion.h1
        style={{ y: titleY }}
        className="display relative z-10 mt-[2.5vw] -mb-[0.06em] text-center text-[22.5vw] leading-[0.78] whitespace-nowrap select-none"
      >
        <SplitText text="Airhoops." trigger="mount" delay={0.15} stagger={0.06} charClassName="text-grit" />
      </motion.h1>

      <span className="absolute right-6 bottom-[24vw] z-10 hidden font-display text-[11px] tracking-[0.3em] text-cream/70 uppercase [writing-mode:vertical-rl] lg:block">
        No. 23 — Shoot your shot
      </span>
    </section>
  );
}
