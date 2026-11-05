"use client";

import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { motion } from "motion/react";
import { useRef } from "react";
import type { PhotoKey } from "@/lib/images";
import { Tag } from "@/components/ui/Pills";
import { ArrowButtons } from "./ArrowButtons";
import { Photo } from "./Photo";

const STEPS: { n: string; state: string; title: string; body: string; photo: PhotoKey }[] = [
  { n: "01", state: "Calibrate", title: "Step into frame", body: "Shoulders, arms and hips in view. The coach tells you when you're set.", photo: "stepFrame" },
  { n: "02", state: "Pickup", title: "Scoop the ball", body: "Drop your hand below your hip and lift: that's your invisible ball.", photo: "stepScoop" },
  { n: "03", state: "Windup", title: "Load the shot", body: "Hand above your shoulder, elbow bent. Higher wind-up, higher arc.", photo: "stepLoad" },
  { n: "04", state: "Throw", title: "Let it fly", body: "Snap toward the screen. Speed sets power, direction sets the angle.", photo: "stepFly" },
  { n: "05", state: "Release", title: "Hear the swish", body: "Nothing but net earns the swish bonus and keeps your streak alive.", photo: "stepSwish" },
];

/** The five beats of a shot, as photo cards on a white board (a swipeable row on small screens). */
export function StepsCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector("article");
    track.scrollBy({ left: dir * ((card?.clientWidth ?? 260) + 12), behavior: "smooth" });
  };

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-5">
      <div className="rounded-[2rem] bg-card px-4 py-8 sm:px-8 sm:py-12">
        <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
          <Tag className="justify-self-start">How it works</Tag>
          <h2 className="display text-[clamp(2rem,4vw,2.75rem)] md:text-center">The five beats of a shot</h2>
        </div>

        <div ref={trackRef} className="no-scrollbar -mx-4 mt-8 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-5 lg:overflow-visible">
          {STEPS.map((s, i) => (
            <motion.article
              key={s.n}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ type: "spring", stiffness: 80, damping: 16, delay: i * 0.07 }}
              className="group relative aspect-[3/4] w-[70vw] max-w-[260px] shrink-0 snap-start overflow-hidden rounded-2xl lg:w-auto lg:max-w-none"
            >
              <Photo photo={s.photo} sizes="(min-width: 1024px) 18vw, 260px" className="absolute inset-0" imgClassName="transition duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
              <Tag tone="glass" className="absolute top-3 right-3">
                {s.state}
              </Tag>
              <div className="absolute inset-x-3 bottom-3 text-cream">
                <div className="flex items-end justify-between gap-2">
                  <Tag tone="clay">Step {s.n}</Tag>
                  <span className="grid size-8 place-items-center rounded-full bg-ink/80 transition group-hover:rotate-45 group-hover:bg-hoop">
                    <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} />
                  </span>
                </div>
                <h3 className="mt-2 text-lg leading-tight">{s.title}</h3>
                <p className="mt-1 text-[11px] leading-snug text-cream/70">{s.body}</p>
              </div>
            </motion.article>
          ))}
        </div>

        <div className="mt-6 flex items-end justify-between gap-6">
          <p className="max-w-xs text-xs leading-relaxed text-stone">
            Calibrate once and your normal throw scores from any distance.{" "}
            <Link href="/how-to-play" className="text-ink underline underline-offset-4 hover:text-hoop">
              Full guide
            </Link>
          </p>
          <ArrowButtons onPrev={() => scroll(-1)} onNext={() => scroll(1)} className="lg:hidden" />
        </div>
      </div>
    </div>
  );
}
