"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChampionIcon,
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

type NavLink = { href: string; label: string; icon: IconSvgElement };

const LEFT: NavLink[] = [
  { href: "/play", label: "Play", icon: PlayIcon },
  { href: "/multiplayer", label: "Multiplayer", icon: UserGroupIcon },
  { href: "/leaderboard", label: "Leaderboard", icon: ChampionIcon },
];
const RIGHT: NavLink[] = [
  { href: "/lab", label: "Lab", icon: TestTube01Icon },
  { href: "/profile", label: "Your player", icon: UserCircleIcon },
  { href: "/privacy", label: "Privacy", icon: SecurityLockIcon },
];
const ALL = [...LEFT, ...RIGHT];

const linkClass = "text-[11px] font-semibold tracking-[0.16em] uppercase transition hover:opacity-100 hover:text-hoop";
const EASE = [0.2, 0.8, 0.2, 1] as const;

export function SiteNav({ tone = "light" }: { tone?: "light" | "dark" }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on navigation, Escape, or growing past the mobile breakpoint; lock page scroll while open.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const wide = window.matchMedia("(min-width: 1024px)");
    const onWide = () => wide.matches && setOpen(false);
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      root.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const desktopLink = (l: NavLink) => (
    <Link key={l.label} href={l.href} aria-current={active(l.href) ? "page" : undefined} className={`${linkClass} ${active(l.href) ? "text-hoop opacity-100" : "opacity-80"}`}>
      {l.label}
    </Link>
  );

  return (
    <header className={`relative z-40 ${tone === "light" ? "text-cream" : "text-ink"}`}>
      <nav aria-label="Main" className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 sm:py-5 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <div className="hidden gap-8 lg:flex">{LEFT.map(desktopLink)}</div>
        <Logo />
        <div className="hidden justify-end gap-8 lg:flex">{RIGHT.map(desktopLink)}</div>

        {/* Below lg: Play + menu button */}
        <div className="flex items-center gap-2 lg:hidden">
          <Link href="/play" className="rounded-full bg-hoop px-4 py-2 text-[11px] font-bold tracking-[0.14em] text-cream uppercase">
            Play
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((o) => !o)}
            className={`relative grid size-10 place-items-center rounded-full border backdrop-blur ${
              tone === "light" ? "border-cream/25 bg-ink/30" : "border-ink/20 bg-cream/40"
            }`}
          >
            <span aria-hidden className={`absolute h-0.5 w-4 rounded bg-current transition ${open ? "rotate-45" : "-translate-y-[3px]"}`} />
            <span aria-hidden className={`absolute h-0.5 w-4 rounded bg-current transition ${open ? "-rotate-45" : "translate-y-[3px]"}`} />
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            data-lenis-prevent
            className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-ink text-cream lg:hidden"
            initial={{ clipPath: "circle(0% at calc(100% - 44px) 36px)" }}
            animate={{ clipPath: "circle(150% at calc(100% - 44px) 36px)" }}
            exit={{ clipPath: "circle(0% at calc(100% - 44px) 36px)" }}
            transition={{ duration: 0.55, ease: EASE }}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_50%_at_100%_0%,rgba(234,58,29,.22),transparent_70%)]" />
            <div className="relative flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
              <Logo />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="relative grid size-10 place-items-center rounded-full border border-cream/25"
                autoFocus
              >
                <span aria-hidden className="absolute h-0.5 w-4 rotate-45 rounded bg-current" />
                <span aria-hidden className="absolute h-0.5 w-4 -rotate-45 rounded bg-current" />
              </button>
            </div>

            <ul className="relative mt-4 flex-1 px-5 sm:px-8">
              {ALL.map((l, i) => (
                <motion.li
                  key={l.href}
                  className="border-b border-cream/10"
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE, delay: 0.12 + i * 0.05 }}
                >
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    aria-current={active(l.href) ? "page" : undefined}
                    className={`group flex items-center justify-between py-3 font-display text-[clamp(2.4rem,11vw,4rem)] leading-none uppercase transition ${
                      active(l.href) ? "text-hoop" : "hover:text-hoop"
                    }`}
                  >
                    {l.label}
                    <span
                      className={`grid size-11 shrink-0 place-items-center rounded-full border transition group-hover:border-hoop group-hover:bg-hoop group-hover:text-cream ${
                        active(l.href) ? "border-hoop bg-hoop text-cream" : "border-cream/15 text-cream/70"
                      }`}
                    >
                      <HugeiconsIcon icon={l.icon} size={22} strokeWidth={1.8} />
                    </span>
                  </Link>
                </motion.li>
              ))}
            </ul>

            <motion.div
              className="relative flex items-center gap-3 px-5 py-6 text-xs text-cream/60 sm:px-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
            >
              <BallIcon className="size-5 animate-bob" />
              Tracking runs on your device. Your video never leaves it.
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
