import Link from "next/link";
import { SplitText } from "@/components/motion/SplitText";

const MODES = ["Free Play", "Timed", "Streak", "Shootout"];
const LINKS = [
  { href: "/lab", label: "Tracking Lab" },
  { href: "#how", label: "How it works" },
  { href: "/leaderboard", label: "Leaderboards" },
  { href: "/privacy", label: "Privacy" },
];

export function SiteFooter() {
  return (
    <footer className="overflow-hidden bg-ink text-cream">
      <div className="mx-auto max-w-7xl px-5 pt-16 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
          <ul className="space-y-1 text-3xl font-medium tracking-tight">
            {MODES.map((m) => (
              <li key={m}>
                <Link href="#modes" className="transition hover:text-hoop">
                  {m}
                </Link>
              </li>
            ))}
          </ul>
          <div className="space-y-8 text-xs">
            <ul className="space-y-1.5">
              {LINKS.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-cream/70 transition hover:text-hoop">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div>
              <p className="text-[10px] tracking-[0.16em] text-cream/40 uppercase">Built for</p>
              <p className="mt-1.5 text-cream/70">Chrome · Edge · Safari · Firefox</p>
              <p className="text-cream/70">Any webcam. No downloads.</p>
            </div>
          </div>
          <div className="flex flex-col justify-between gap-6 md:items-end">
            <p className="text-[10px] tracking-[0.16em] text-cream/40 uppercase">Your video never leaves your device</p>
            <div className="flex flex-wrap gap-2">
              {["Instagram", "TikTok", "YouTube"].map((s) => (
                <span key={s} className="rounded-full border border-cream/15 px-4 py-1.5 text-[11px] text-cream/70">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        <Link href="/play" className="group mt-14 block" aria-label="Play AirHoops">
          <span className="display block text-[15vw] leading-[0.8] whitespace-nowrap text-hoop transition-colors group-hover:text-hoop-soft xl:text-[12.8rem]">
            <SplitText text="/ Take the shot" stagger={0.04} />
          </span>
        </Link>

        <div className="mt-10 flex flex-wrap justify-between gap-4 border-t border-cream/10 py-6 text-[11px] text-cream/40">
          <Link href="/privacy" className="hover:text-cream">
            Privacy: tracking runs 100% on-device
          </Link>
          <span>© AirHoops</span>
        </div>
      </div>
    </footer>
  );
}
