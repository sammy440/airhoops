import Link from "next/link";
import { SplitText } from "@/components/motion/SplitText";

const MODES = ["Free Play", "Timed", "Streak", "Shootout"];
const GITHUB_URL = "https://github.com/sammy440/airhoops";
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
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2.5 self-start rounded-full border border-cream/15 py-2 pr-4 pl-2.5 text-xs font-semibold text-cream/85 transition hover:border-cream/40 hover:text-cream md:self-auto"
            >
              <svg viewBox="0 0 16 16" className="size-5" fill="currentColor" aria-hidden>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              Star or contribute on GitHub
              <span aria-hidden className="text-sun transition group-hover:rotate-12">★</span>
            </a>
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
