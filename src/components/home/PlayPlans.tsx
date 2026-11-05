import { Camera01Icon, KeyboardIcon, UserGroupIcon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import Link from "next/link";
import { Tag } from "@/components/ui/Pills";
import { Photo } from "./Photo";
import { Reveal } from "./Reveal";

type Plan = {
  badge: string;
  chip: string;
  title: [string, string];
  sub: string;
  price: string;
  note: string;
  icons: { icon: IconSvgElement; label: string }[];
  href: string;
  tone: "clay" | "court";
};

const PLANS: Plan[] = [
  {
    badge: "Popular",
    chip: "4 modes",
    title: ["Solo", "Session"],
    sub: "Free play, timed, streak and daily",
    price: "Free",
    note: "no sign-up",
    icons: [
      { icon: Camera01Icon, label: "Camera" },
      { icon: KeyboardIcon, label: "Keyboard" },
    ],
    href: "/play",
    tone: "clay",
  },
  {
    badge: "With friends",
    chip: "Private rooms",
    title: ["Multiplayer", "Match"],
    sub: "Shootout, race and H-O-R-S-E",
    price: "Free",
    note: "share a code",
    icons: [
      { icon: UserGroupIcon, label: "Friends" },
      { icon: Camera01Icon, label: "Camera" },
    ],
    href: "/multiplayer",
    tone: "court",
  },
];

/** Two ways to play, as big clay and green cards. */
export function PlayPlans() {
  return (
    <section className="mx-auto w-full max-w-7xl px-3 py-14 sm:px-5 sm:py-20">
      <Reveal>
        <h2 className="display mx-auto max-w-xl text-center text-[clamp(2rem,4vw,3rem)] leading-[1.08]">Find the right game for your session</h2>
      </Reveal>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {PLANS.map((p, i) => (
          <Reveal key={p.href} delay={i * 120}>
            <Link
              href={p.href}
              className={`group relative flex min-h-[26rem] flex-col items-center overflow-hidden rounded-[2rem] p-5 text-center text-cream sm:min-h-[30rem] ${p.tone === "clay" ? "bg-hoop" : "bg-court"}`}
            >
              {p.tone === "clay" ? (
                // A loose swoosh, like the trail of a shot
                <svg viewBox="0 0 400 300" className="absolute -top-10 -left-16 w-[120%] text-white/10" aria-hidden>
                  <path d="M10 260C60 80 180 20 260 60s40 150-60 160S120 120 250 40" fill="none" stroke="currentColor" strokeWidth="38" strokeLinecap="round" />
                </svg>
              ) : (
                <>
                  <Photo photo="mode1v1" decorative sizes="(min-width: 768px) 50vw, 100vw" className="absolute inset-0" imgClassName="opacity-55 mix-blend-luminosity" />
                  <div className="absolute inset-0 bg-court/55" />
                </>
              )}

              <div className="relative flex w-full items-start justify-between">
                <Tag tone="dark">{p.badge}</Tag>
                <span className="flex flex-col items-end gap-1">
                  <span className="flex -space-x-2">
                    {p.icons.map((ic) => (
                      <span key={ic.label} title={ic.label} className="grid size-9 place-items-center rounded-full bg-cream text-ink ring-2 ring-white/30">
                        <HugeiconsIcon icon={ic.icon} size={16} />
                      </span>
                    ))}
                  </span>
                  <span className="text-[10px] text-cream/75">{p.icons.map((ic) => ic.label).join(" or ")}</span>
                </span>
              </div>

              <div className="relative my-auto flex flex-col items-center py-8">
                <Tag tone="glass">{p.chip}</Tag>
                <h3 className="display mt-4 text-[clamp(2.4rem,4.6vw,3.5rem)] leading-[0.98]">
                  {p.title[0]}
                  <br />
                  {p.title[1]}
                </h3>
                <p className="mt-3 text-sm text-cream/80">{p.sub}</p>
                <span className="mt-8 inline-flex items-baseline gap-2 rounded-full bg-ink px-7 py-3.5">
                  <span className="text-2xl font-semibold">{p.price}</span>
                  <span className="text-[11px] text-cream/70">/ {p.note}</span>
                </span>
              </div>

              <span className="relative grid size-12 place-items-center self-end rounded-full bg-cream text-ink transition group-hover:rotate-45">
                <HugeiconsIcon icon={ArrowUpRight01Icon} size={20} />
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
