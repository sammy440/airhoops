"use client";

import { motion } from "motion/react";
import { useRef } from "react";
import { SplitText } from "@/components/motion/SplitText";
import type { PhotoKey } from "@/lib/images";
import { ArrowButtons } from "./ArrowButtons";
import { Photo } from "./Photo";

const STEPS: { n: string; state: string; title: string; sub: string; body: string; photo: PhotoKey }[] = [
  { n: "01", state: "Calibrate", title: "Step Into", sub: "Frame", body: "Stand back until your shoulders, arms and hips are in view. The coach tells you when you're set.", photo: "stepFrame" },
  { n: "02", state: "Pickup", title: "Scoop The", sub: "Ball", body: "Drop your hand to the ball zone below your hip and lift. That's your invisible ball.", photo: "stepScoop" },
  { n: "03", state: "Windup", title: "Load The", sub: "Shot", body: "Raise your hand above your shoulder and bend the elbow. Higher wind-up, higher arc.", photo: "stepLoad" },
  { n: "04", state: "Throw", title: "Let It", sub: "Fly", body: "Snap your wrist toward the screen. Peak speed sets power, the direction sets the angle.", photo: "stepFly" },
  { n: "05", state: "Release", title: "Hear The", sub: "Swish", body: "Nothing but net earns the swish bonus and keeps your streak alive.", photo: "stepSwish" },
];

/**
 * Desktop: a centered 5-column grid aligned with the heading.
 * Smaller screens: a swipeable, snapping carousel driven by the arrows.
 */
export function StepsCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector("article");
    track.scrollBy({ left: dir * ((card?.clientWidth ?? 280) + 16), behavior: "smooth" });
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex items-end justify-between px-5 sm:px-8">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium">
            <span className="size-1.5 rounded-full bg-ink" /> How it works
          </p>
          <h2 className="display mt-3 text-5xl text-hoop sm:text-6xl">
            <SplitText text="Steps of the shot" />
          </h2>
        </div>
        <div className="lg:hidden">
          <ArrowButtons onPrev={() => scroll(-1)} onNext={() => scroll(1)} />
        </div>
      </div>

      <div
        ref={trackRef}
        className="no-scrollbar mt-10 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto scroll-smooth px-5 pb-4 sm:scroll-px-8 sm:px-8 lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0"
      >
        {STEPS.map((s, i) => (
          <motion.article
            key={s.n}
            // Cards deal in one after another, each tilted a different way.
            initial={{ opacity: 0, y: 90, rotate: i % 2 ? 4 : -4 }}
            whileInView={{ opacity: 1, y: 0, rotate: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ type: "spring", stiffness: 70, damping: 15, delay: i * 0.09 }}
            className="group flex w-[78vw] max-w-[300px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl ring-1 ring-ink/5 transition-[translate,box-shadow] duration-500 hover:-translate-y-1.5 hover:shadow-[0_24px_50px_-24px_rgba(14,14,13,.45)] lg:w-auto lg:max-w-none"
          >
            <div className="flex flex-1 flex-col bg-white/60 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-sand px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase">Step {s.n}</span>
                  <span className="rounded-full bg-ink px-2.5 py-1 text-[10px] font-semibold tracking-wide text-cream uppercase">{s.state}</span>
                </div>
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full border transition ${
                    i === 1 ? "border-hoop bg-hoop text-cream" : "border-ink/15 group-hover:border-hoop group-hover:bg-hoop group-hover:text-cream"
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <path d="M7 17L17 7M8 7h9v9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
              <h3 className="mt-4 text-lg leading-tight font-semibold">
                {s.title} <span className={i === 1 ? "text-hoop" : ""}>({s.sub})</span>
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-stone">{s.body}</p>
            </div>
            <Photo
              photo={s.photo}
              sizes="(min-width: 1024px) 20vw, 300px"
              className="aspect-[4/3.6]"
              imgClassName="grayscale transition duration-700 group-hover:scale-105 group-hover:grayscale-0"
            />
          </motion.article>
        ))}
      </div>
    </div>
  );
}
