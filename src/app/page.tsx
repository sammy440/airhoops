import Image from "next/image";
import Link from "next/link";
import { Crop } from "@/components/home/Crop";
import { HERO_IMAGE } from "@/lib/images";
import { ModesShowcase } from "@/components/home/ModesShowcase";
import { Reveal } from "@/components/home/Reveal";
import { SiteFooter } from "@/components/home/SiteFooter";
import { SiteNav } from "@/components/home/SiteNav";
import { StepsCarousel } from "@/components/home/StepsCarousel";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
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

/* ───────────────────────── Hero ───────────────────────── */

function Hero() {
  return (
    <section className="relative flex h-[100svh] min-h-[620px] flex-col overflow-hidden bg-ink">
      <Image
        src={HERO_IMAGE}
        alt="Basketball dropping through the net under arena lights"
        placeholder="blur"
        fill
        priority
        sizes="100vw"
        className="object-cover object-[32%_40%]"
      />
      {/* Warm grade: dark top for the nav, sun-baked orange bottom for the title */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink/55 via-transparent to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-sun via-sun/60 to-transparent mix-blend-multiply" />
      <div className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-sun/90 to-transparent" />

      <SiteNav tone="light" />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-end px-5 sm:px-8">
        <div className="mb-4 flex items-end justify-between gap-6">
          <div className="max-w-xs">
            <p className="font-display text-lg tracking-wide text-hoop uppercase">/ Dream</p>
            <p className="mt-2 text-sm leading-relaxed font-medium text-cream/90">
              Mime the throw. Watch the ball fly. A basketball game controlled by nothing but your body.
            </p>
          </div>
          <Link
            href="/lab"
            className="group hidden items-center gap-3 rounded-full bg-ink py-2 pr-2 pl-5 text-sm font-semibold text-cream transition hover:bg-hoop sm:flex"
          >
            Start shooting
            <span className="grid size-8 place-items-center rounded-full bg-cream text-ink transition group-hover:rotate-45">↗</span>
          </Link>
        </div>
      </div>

      <h1 className="display text-grit relative z-10 mt-[2.5vw] -mb-[0.06em] text-center text-[22.5vw] leading-[0.78] whitespace-nowrap select-none">
        Airhoops.
      </h1>

      <span className="absolute right-3 bottom-[24vw] z-10 font-display text-[11px] tracking-[0.3em] text-cream/70 uppercase [writing-mode:vertical-rl] sm:right-6">
        No. 23 — Shoot your shot
      </span>
    </section>
  );
}

/* ─────────────────── The air moves us ─────────────────── */

function AirMovesUs() {
  return (
    <section className="relative px-5 py-20 sm:px-8 sm:py-28">
      <Reveal>
        <div className="@container relative mx-auto aspect-[4/3.1] w-full max-w-5xl">
          <span className="display absolute top-[6%] left-[2%] text-[17cqw] text-ink">The</span>

          <div className="animate-bob absolute top-[10%] left-[24%] h-[68%] w-[46%] [--r:-5deg]">
            <Crop
              focus="swish"
              zoom={1.35}
              sizes="(max-width: 1024px) 50vw, 480px"
              className="h-full w-full rounded-[2rem] shadow-[0_40px_80px_-30px_rgba(14,14,13,.55)] ring-1 ring-ink/10"
            />
          </div>

          <span className="display absolute top-[36%] right-[12%] text-[17cqw] text-hoop">Air</span>
          <span className="display absolute bottom-[5%] left-[16%] text-[17cqw] text-hoop">
            Moves <span className="text-ink">us</span>
          </span>
        </div>
      </Reveal>
    </section>
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
          <div className="flex items-start justify-between gap-4">
            <h2 className="display text-5xl sm:text-7xl">
              Let&apos;s jump to
              <br />
              the play —
            </h2>
            <span className="display hidden text-7xl text-cream/30 md:block">/</span>
            <Link href="/lab" className="display text-5xl transition hover:text-hoop sm:text-7xl">
              Play
            </Link>
          </div>

          <div className="relative my-10 sm:my-14">
            <div className="flex w-max animate-marquee text-xl whitespace-nowrap text-cream/35 sm:text-3xl">
              <span>{marquee.repeat(2)}</span>
              <span>{marquee.repeat(2)}</span>
            </div>
            <div className="absolute top-1/2 left-1/2 w-40 -translate-x-1/2 -translate-y-1/2 rotate-[-4deg] sm:w-64">
              <Crop focus="ball" zoom={2} sizes="256px" className="aspect-[4/3] rounded-xl ring-4 ring-ink" />
            </div>
          </div>

          <div className="flex flex-col justify-between gap-10 md:flex-row md:items-end">
            <div className="max-w-xs">
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
            </div>
            <ul className="text-right">
              {PLAY_WORDS.map((w, i) => (
                <li key={w.word}>
                  <Link
                    href={w.href}
                    className={`display block text-5xl transition sm:text-6xl ${i === 1 ? "text-hoop" : "text-cream/85 hover:text-hoop"}`}
                  >
                    {w.word}
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
  const hl = "text-hoop";
  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-5 pt-24 sm:px-8 sm:pt-32 md:grid-cols-[120px_1fr]">
      <span className="text-[10px] tracking-[0.14em] text-stone uppercase">(About)</span>
      <Reveal>
        <div className="display text-right text-[clamp(1.9rem,4.6vw,3.9rem)] leading-[1.02] text-stone">
          At <span className={hl}>Airhoops</span> we believe the game lives{" "}
          <span className={hl}>in your arms</span>, not in a controller. From the first{" "}
          <span className="relative inline-block h-[0.9em] w-[1.5em] translate-y-[0.08em] overflow-hidden rounded-md bg-hoop align-baseline">
            <Crop focus="net" zoom={2} sizes="120px" className="h-full w-full" imgClassName="grayscale mix-blend-multiply" />
          </span>{" "}
          scoop to the final <span className={hl}>swish</span>, every motion becomes the shot, right in your browser.
        </div>
      </Reveal>
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
            <h2 className="display mt-4 text-6xl text-hoop">On-device/</h2>
            <p className="mt-5 max-w-xs text-xs leading-relaxed font-semibold uppercase">
              GPU pose tracking, One Euro smoothing, shoulder-width normalization,{" "}
              <span className="text-hoop/60">and a forgiving throw detector tuned on real data.</span>
            </p>
            <Link href="/lab" className="mt-6 inline-block text-xs font-semibold underline underline-offset-4 hover:text-hoop">
              Open the lab
            </Link>
          </div>

          <div className="relative mx-auto w-56 sm:w-64">
            <div className="absolute inset-0 translate-x-3 -translate-y-3 rotate-3 rounded-2xl bg-hoop-soft/50" />
            <div className="absolute inset-0 translate-x-1.5 -translate-y-1.5 rotate-[1.5deg] rounded-2xl bg-sun/70" />
            <Crop focus="swish" zoom={1.5} sizes="256px" className="relative aspect-[3/4] rounded-2xl" />
          </div>

          <div className="flex h-full flex-col items-end justify-between gap-8 text-right">
            <span className="display text-outline text-7xl opacity-60 sm:text-8xl">33+</span>
            <div>
              <span className="display block text-6xl text-hoop">Landmarks</span>
              <span className="mt-2 block text-xs text-ink/60">tracked every frame, zero uploaded.</span>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
