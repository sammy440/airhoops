import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

const LEFT = [
  { href: "/play", label: "Play" },
  { href: "/lab", label: "Lab" },
  { href: "/#how", label: "How it works" },
];
const RIGHT = [
  { href: "/#modes", label: "Modes" },
  { href: "/#privacy", label: "Privacy" },
];

const linkClass = "text-[11px] font-semibold tracking-[0.16em] uppercase opacity-80 transition hover:opacity-100 hover:text-hoop";

export function SiteNav({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <header className={`relative z-20 ${tone === "light" ? "text-cream" : "text-ink"}`}>
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:px-8">
        <div className="hidden gap-8 sm:flex">
          {LEFT.map((l) => (
            <Link key={l.label} href={l.href} className={linkClass}>
              {l.label}
            </Link>
          ))}
        </div>
        <Logo />
        <div className="flex justify-end gap-8">
          {RIGHT.map((l) => (
            <Link key={l.label} href={l.href} className={`${linkClass} hidden sm:inline`}>
              {l.label}
            </Link>
          ))}
          <Link href="/play" className="rounded-full bg-hoop px-4 py-1.5 text-[11px] font-bold tracking-[0.14em] text-cream uppercase sm:hidden">
            Play
          </Link>
        </div>
      </nav>
    </header>
  );
}
