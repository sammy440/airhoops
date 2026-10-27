import Link from "next/link";
import { AirMovesUs } from "@/components/home/AirMovesUs";
import { Hero } from "@/components/home/Hero";
import { ModesShowcase } from "@/components/home/ModesShowcase";
import { Photo } from "@/components/home/Photo";
import { Reveal } from "@/components/home/Reveal";
import { SiteFooter } from "@/components/home/SiteFooter";
import { StepsCarousel } from "@/components/home/StepsCarousel";
import { Appear, FanStack } from "@/components/motion/Appear";
import { CountUp } from "@/components/motion/CountUp";
import { ScrollWords } from "@/components/motion/ScrollWords";
import { SplitText } from "@/components/motion/SplitText";

export default function Home() {
  return (
    <div id="main" className="flex flex-1 flex-col">
      <Hero />
      <AirMovesUs />
      <JumpToPlay />
      <Manifesto />
      <section id="how" className="scroll-mt-8 py-20 sm:py-28">
        <StepsCarousel />
      </section>
      <Featured />
      <section id="modes" className="scroll-mt-8 py-20 sm:py-28">
        <ModesShowcase />
      </section>
      <SiteFooter />
    </div>
  );
}

/* ─────────────────── Black "jump to play" panel ─────────────────── */

const PLAY_WORDS = [
  { word: "Track", href: "/lab" },
  { word: "Throw", href: "#how" },
  { word: "Score", href: "#modes" },
];

function JumpToPlay() {
  const marquee = "Your Body Is The Controller • No Ball • No Court • No Video Leaves Your Device • Just Air • ";
  return (
    <section className="px-3 sm:px-5">
      <Reveal>
        <div className="grain relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-ink px-5 pt-8 pb-8 text-cream sm:px-10 sm:pt-12">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
            <h2 className="display text-[clamp(2.6rem,12vw,4.5rem)] leading-[0.95]">
              <SplitText text="Let's jump to" />
              <br />
              <SplitText text="the play —" delay={0.25} />
            </h2>
            <span className="display hidden text-7xl text-cream/30 md:block">/</span>
            <Link href="/play" className="display flex items-center gap-2 text-[clamp(2.6rem,12vw,4.5rem)] leading-[0.95] text-hoop transition hover:text-hoop-soft sm:text-cream sm:hover:text-hoop">
              <SplitText text="Play" delay={0.4} />
              <span aria-hidden className="font-sans text-2xl sm:hidden">↗</span>
            </Link>
          </div>

          <div className="relative my-10 sm:my-14">
            <div className="flex w-max animate-marquee text-xl whitespace-nowrap text-cream/35 sm:text-3xl">
              <span>{marquee.repeat(2)}</span>
              <span>{marquee.repeat(2)}</span>
            </div>
            <div className="absolute top-1/2 left-1/2 w-40 -translate-x-1/2 -translate-y-1/2 rotate-[-4deg] sm:w-64">
              <Appear from={{ scale: 0.5, rotate: -25, y: 30 }} duration={1.1}>
                <Photo photo="jumpLeap" sizes="256px" className="aspect-[4/3] rounded-xl ring-4 ring-ink" />
              </Appear>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
            <Appear className="max-w-xs" from={{ y: 30 }}>
              <Link href="/lab" className="text-xs font-semibold underline underline-offset-4 hover:text-hoop">
                Let&apos;s dive in
              </Link>
              <p className="mt-3 text-xs leading-relaxed text-cream/60">
                Pose tracking, throw detection and ball physics, all running live in your browser tab.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-hoop px-3 py-1 text-[10px] font-bold uppercase">On-device</span>
                <span className="rounded-full border border-cream/20 px-3 py-1 text-[10px] uppercase">33 landmarks</span>
                <span className="rounded-full border border-cream/20 px-3 py-1 text-[10px] uppercase">30+ fps</span>
              </div>
            </Appear>
            <ul className="self-end text-right">
              {PLAY_WORDS.map((w, i) => (
                <li key={w.word}>
                  <Link
                    href={w.href}
                    className={`display block text-5xl transition sm:text-6xl ${i === 1 ? "text-hoop" : "text-cream/85 hover:text-hoop"}`}
                  >
                    <SplitText text={w.word} delay={i * 0.15} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ─────────────────── Manifesto ─────────────────── */

function Manifesto() {
  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-5 pt-24 sm:px-8 sm:pt-32 md:grid-cols-[120px_1fr]">
      <span className="text-[10px] tracking-[0.14em] text-stone uppercase">(About)</span>
      <ScrollWords
        className="display text-left text-[clamp(1.9rem,4.6vw,3.9rem)] leading-[1.02] md:text-right"
        segments={[
          { text: "At" },
          { text: "Airhoops", highlight: true },
          { text: "we believe the game lives" },
          { text: "in your arms,", highlight: true },
          { text: "not in a controller. From the first" },
          {
            node: (
              <span className="relative inline-block h-[0.9em] w-[1.5em] translate-y-[0.08em] overflow-hidden rounded-md bg-hoop align-baseline">
                <Photo photo="sunsetHoop" decorative sizes="120px" className="h-full w-full" imgClassName="grayscale mix-blend-multiply" />
              </span>
            ),
          },
          { text: "scoop to the final" },
          { text: "swish,", highlight: true },
          { text: "every motion becomes the shot, right in your browser." },
        ]}
      />
    </section>
  );
}

/* ─────────────────── Featured ─────────────────── */

function Featured() {
  return (
    <section className="px-3 sm:px-5">
      <Reveal>
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 overflow-hidden rounded-[2rem] bg-sand px-6 py-10 sm:px-10 md:grid-cols-[1fr_auto_1fr] md:py-14">
          <div>
            <p className="flex items-center gap-2 text-xs font-medium">
              <span className="size-1.5 rounded-full bg-ink" /> Under the hood
            </p>
            <h2 className="display mt-4 text-[clamp(3rem,14vw,3.75rem)] text-hoop">
              <SplitText text="On-device/" />
            </h2>
            <p className="mt-5 max-w-xs text-xs leading-relaxed font-semibold uppercase">
              GPU pose tracking, One Euro smoothing, torso-length normalization,{" "}
              <span className="text-hoop/60">and a forgiving throw detector tuned on real data.</span>
            </p>
            <Link href="/lab" className="mt-6 inline-block text-xs font-semibold underline underline-offset-4 hover:text-hoop">
              Open the lab
            </Link>
          </div>

          <FanStack className="mx-auto w-56 sm:w-64">
            <Photo photo="enjoyGame" sizes="256px" className="relative aspect-[3/4] rounded-2xl" />
          </FanStack>

          <div className="flex h-full flex-row items-end justify-between gap-6 text-right md:flex-col md:items-end md:gap-8">
            <CountUp to={33} suffix="+" className="display text-outline text-6xl opacity-60 sm:text-8xl" />
            <div>
              <span className="display block text-[clamp(2.5rem,11vw,3.75rem)] leading-[1.05] text-hoop">
                <SplitText text="Landmarks" delay={0.2} />
              </span>
              <span className="mt-2 block text-xs text-ink/60">tracked every frame, zero uploaded.</span>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
