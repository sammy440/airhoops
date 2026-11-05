"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight01Icon,
  BookOpen01Icon,
  Cancel01Icon,
  ChampionIcon,
  Menu01Icon,
  PlayIcon,
  SecurityLockIcon,
  TestTube01Icon,
  UserCircleIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { BallIcon, Logo } from "@/components/ui/Logo";
import { ArrowLink, IconButton, IconLink } from "@/components/ui/Pills";
import { DEV_TOOLS } from "@/lib/devTools";

type NavLink = { href: string; label: string; icon: IconSvgElement };

const PILLS: NavLink[] = [
  { href: "/multiplayer", label: "Multiplayer", icon: UserGroupIcon },
  { href: "/leaderboard", label: "Leaderboard", icon: ChampionIcon },
  { href: "/how-to-play", label: "How to play", icon: BookOpen01Icon },
];
const ALL: NavLink[] = [
  { href: "/play", label: "Play", icon: PlayIcon },
  ...PILLS,
  { href: "/profile", label: "Your player", icon: UserCircleIcon },
  { href: "/privacy", label: "Privacy", icon: SecurityLockIcon },
  // The tracking lab is a developer tool: only in development
  ...(DEV_TOOLS ? [{ href: "/lab", label: "Lab", icon: TestTube01Icon }] : []),
];

const EASE = [0.2, 0.8, 0.2, 1] as const;

/**
 * `tone` is the text colour: "light" over a photo (the home hero), "dark" on the paper background.
 * Over the hero the logo sits in a paper-coloured notch cut into the top of the photo.
 */
export function SiteNav({ tone = "dark" }: { tone?: "light" | "dark" }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const onImage = tone === "light";

  // Close on navigation or Escape; lock page scroll while open.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const pill = (on: boolean) =>
    on
      ? onImage
        ? "border-cream bg-cream text-ink"
        : "border-ink bg-ink text-cream"
      : onImage
        ? "border-white/40 bg-white/10 text-cream backdrop-blur-md hover:bg-white/25"
        : "border-ink/15 text-ink/80 hover:border-ink hover:text-ink";

  return (
    <header className={`relative z-40 ${onImage ? "text-cream" : "text-ink"}`}>
      <nav aria-label="Main" className="relative flex items-center justify-between px-4 py-4 sm:px-6 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <div className="hidden gap-2 lg:flex">
          {PILLS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active(l.href) ? "page" : undefined}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${pill(active(l.href))}`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {onImage ? (
          // The notch: a paper tab with curved shoulders, so the photo looks cut around the logo
          <div className="absolute top-0 left-1/2 hidden -translate-x-1/2 rounded-b-[1.4rem] bg-paper px-7 pt-3 pb-3.5 text-ink lg:block">
            <span aria-hidden className="absolute top-0 -left-5 size-5 bg-[radial-gradient(circle_at_0_100%,transparent_1.25rem,var(--color-paper)_1.3rem)]" />
            <span aria-hidden className="absolute top-0 -right-5 size-5 bg-[radial-gradient(circle_at_100%_100%,transparent_1.25rem,var(--color-paper)_1.3rem)]" />
            <Logo />
          </div>
        ) : null}
        <Logo className={onImage ? "lg:invisible" : ""} />

        <div className="flex items-center justify-end gap-2">
          <IconLink
            href="/profile"
            icon={UserCircleIcon}
            label="Your player"
            tone={onImage ? "glass" : "outline"}
            size={38}
            className="hidden sm:grid"
            aria-current={active("/profile") ? "page" : undefined}
          />
          <ArrowLink href="/play" tone={onImage ? "light" : "dark"} size="sm" icon={PlayIcon}>
            Play
          </ArrowLink>
          <IconButton
            icon={Menu01Icon}
            label="Open menu"
            tone={onImage ? "glass" : "outline"}
            size={38}
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen(true)}
          />
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close menu"
              tabIndex={-1}
              className="fixed inset-0 z-50 cursor-default bg-ink/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              id="site-menu"
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              data-lenis-prevent
              className="fixed inset-y-2 right-2 z-50 flex w-[min(26rem,calc(100vw-1rem))] flex-col overflow-y-auto rounded-[1.75rem] bg-paper text-ink shadow-2xl"
              initial={{ x: "105%" }}
              animate={{ x: 0 }}
              exit={{ x: "105%" }}
              transition={{ duration: 0.5, ease: EASE }}
            >
              <div className="flex items-center justify-between px-5 py-4">
                <Logo />
                <IconButton icon={Cancel01Icon} label="Close menu" onClick={() => setOpen(false)} size={38} autoFocus />
              </div>

              <ul className="flex-1 space-y-2 px-3">
                {ALL.map((l, i) => (
                  <motion.li
                    key={l.href}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.45, ease: EASE, delay: 0.1 + i * 0.04 }}
                  >
                    <Link
                      href={l.href}
                      onClick={() => setOpen(false)}
                      aria-current={active(l.href) ? "page" : undefined}
                      className={`group flex items-center gap-4 rounded-2xl p-3 transition ${active(l.href) ? "bg-ink text-cream" : "bg-card hover:bg-white"}`}
                    >
                      <span className={`grid size-11 shrink-0 place-items-center rounded-full ${active(l.href) ? "bg-hoop text-cream" : "bg-paper"}`}>
                        <HugeiconsIcon icon={l.icon} size={20} strokeWidth={1.8} />
                      </span>
                      <span className="display flex-1 text-2xl">{l.label}</span>
                      <HugeiconsIcon icon={ArrowUpRight01Icon} size={20} className="opacity-40 transition group-hover:rotate-45 group-hover:opacity-100" />
                    </Link>
                  </motion.li>
                ))}
              </ul>

              <div className="m-3 flex items-center gap-3 rounded-2xl bg-ink p-4 text-xs text-cream/70">
                <BallIcon className="size-6 shrink-0 animate-bob" />
                Tracking runs on your device. Your video never leaves it.
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
