"use client";

import { useRef } from "react";
import { ArrowButtons } from "./ArrowButtons";
import { Crop, type FOCUS } from "./Crop";

const STEPS: {
  n: string;
  state: string;
  title: string;
  sub: string;
  body: string;
  focus: keyof typeof FOCUS;
  zoom: number;
}[] = [
  { n: "01", state: "Calibrate", title: "Step Into", sub: "Frame", body: "Stand back until your shoulders, arms and hips are in view. The coach tells you when you're set.", focus: "crowd", zoom: 1.5 },
  { n: "02", state: "Idle → Pickup", title: "Scoop The", sub: "Ball", body: "Drop your hand to the ball zone below your hip and lift. That's your invisible ball.", focus: "ball", zoom: 2.2 },
  { n: "03", state: "Pickup → Windup", title: "Load The", sub: "Shot", body: "Raise your hand above your shoulder and bend the elbow. Higher wind-up, higher arc.", focus: "rim", zoom: 2 },
  { n: "04", state: "Windup → Throw", title: "Let It", sub: "Fly", body: "Snap your wrist toward the screen. Peak speed sets power, the direction sets the angle.", focus: "swish", zoom: 1.4 },
  { n: "05", state: "Release", title: "Hear The", sub: "Swish", body: "The ball arcs into the net. Nothing but net earns the swish bonus and keeps your streak alive.", focus: "net", zoom: 2 },
];

export function StepsCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector("article");
    track.scrollBy({ left: dir * ((card?.clientWidth ?? 280) + 16), behavior: "smooth" });
  };

  return (
    <div>
      <div className="mx-auto flex max-w-7xl items-end justify-between px-5 sm:px-8">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium">
            <span className="size-1.5 rounded-full bg-ink" /> How it works
          </p>
          <h2 className="display mt-3 text-5xl text-hoop sm:text-6xl">Steps of the shot</h2>
        </div>
        <ArrowButtons onPrev={() => scroll(-1)} onNext={() => scroll(1)} />
      </div>

      <div
        ref={trackRef}
        className="no-scrollbar mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-5 pb-4 sm:px-[max(2rem,calc((100vw-80rem)/2+2rem))]"
      >
        {STEPS.map((s, i) => (
          <article key={s.n} className="group w-[78vw] max-w-[300px] shrink-0 snap-start">
            <div className="rounded-t-2xl bg-white/60 p-4 ring-1 ring-ink/5">
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  <span className="rounded-full bg-sand px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase">Step {s.n}</span>
                  <span className="rounded-full bg-ink px-2.5 py-1 text-[10px] font-semibold tracking-wide text-cream uppercase">{s.state}</span>
                </div>
                <span
                  className={`grid size-7 place-items-center rounded-full border transition ${
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
            <Crop
              focus={s.focus}
              zoom={s.zoom}
              sizes="300px"
              className="aspect-[4/3.4] rounded-b-2xl"
              imgClassName="grayscale transition duration-700 group-hover:grayscale-0"
            />
          </article>
        ))}
      </div>
    </div>
  );
}
