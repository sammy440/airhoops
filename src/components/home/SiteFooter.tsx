"use client";

import { ArrowRight02Icon, GithubIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/ui/Logo";
import { extractRoomCode, ROOM_CODE_LENGTH } from "@/lib/net/api";

const GITHUB_URL = "https://github.com/sammy440/airhoops";
const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Play",
    links: [
      { href: "/play", label: "Free play" },
      { href: "/play", label: "Timed" },
      { href: "/play", label: "Streak" },
      { href: "/play", label: "Daily challenge" },
      { href: "/multiplayer", label: "Multiplayer" },
    ],
  },
  {
    title: "About",
    links: [
      { href: "/how-to-play", label: "How to play" },
      { href: "/leaderboard", label: "Leaderboard" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
];

/** The footer card: links, GitHub, and a room-code box that drops you straight into a friend's room. */
export function SiteFooter() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const clean = extractRoomCode(code);

  return (
    <footer className="px-3 pb-3 sm:px-5 sm:pb-5">
      <div className="mx-auto max-w-7xl rounded-[2rem] bg-card px-5 pt-8 pb-5 sm:px-10 sm:pt-10">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[1.4fr_0.8fr_0.8fr_0.7fr_1.3fr]">
          <div className="col-span-2 flex flex-col justify-between gap-10 md:col-span-1">
            <Logo className="text-xl" />
            <p className="display max-w-[15rem] text-xl leading-[1.35]">
              <span className="mark">Your arms</span>, your shot. <span className="mark">On-device</span> tracking for every throw
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-medium">{col.title}</p>
              <ul className="mt-3 space-y-2 text-xs text-ink/65">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="transition hover:text-hoop">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <p className="text-sm font-medium">Code</p>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1 text-xs transition hover:border-ink"
            >
              <HugeiconsIcon icon={GithubIcon} size={14} />
              GitHub
            </a>
          </div>

          <div className="col-span-2 md:col-span-1">
            <p className="text-sm font-medium">Join a room</p>
            <form
              className="mt-3 flex items-center gap-2 rounded-full border border-ink/15 py-1 pr-1 pl-4 focus-within:border-ink"
              onSubmit={(e) => {
                e.preventDefault();
                if (clean.length === ROOM_CODE_LENGTH) router.push(`/multiplayer?room=${clean}`);
              }}
            >
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Room code"
                aria-label="Room code"
                autoCapitalize="characters"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-base tracking-widest uppercase outline-none placeholder:font-sans placeholder:tracking-normal placeholder:normal-case placeholder:text-stone sm:text-sm"
              />
              <button
                type="submit"
                aria-label="Join room"
                disabled={clean.length !== ROOM_CODE_LENGTH}
                className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-cream transition hover:bg-hoop disabled:opacity-40"
              >
                <HugeiconsIcon icon={ArrowRight02Icon} size={16} />
              </button>
            </form>
          </div>
        </div>

        <div className="mt-14 flex flex-wrap justify-between gap-3 text-[11px] text-stone">
          <Link href="/privacy" className="hover:text-ink">
            Privacy: tracking runs 100% on-device
          </Link>
          <span>© AirHoops</span>
        </div>
      </div>
    </footer>
  );
}
