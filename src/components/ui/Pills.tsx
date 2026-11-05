import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/* The site's few control shapes: a pill with a round arrow, round icon buttons, and outline tags. */

type Tone = "dark" | "light" | "clay" | "outline" | "glass";

const PILL: Record<Exclude<Tone, "outline" | "glass">, { pill: string; dot: string }> = {
  dark: { pill: "bg-ink text-cream hover:bg-black", dot: "bg-cream text-ink" },
  light: { pill: "bg-card text-ink hover:bg-white", dot: "bg-ink text-cream" },
  clay: { pill: "bg-hoop text-cream hover:bg-hoop-soft", dot: "bg-cream text-ink" },
};

type ArrowPillProps = { children: ReactNode; tone?: keyof typeof PILL; icon?: IconSvgElement; className?: string; size?: "sm" | "md" };

const pillClass = (tone: keyof typeof PILL, size: "sm" | "md", className: string) =>
  `group inline-flex items-center gap-3 rounded-full font-medium transition disabled:pointer-events-none disabled:opacity-40 ${
    size === "sm" ? "py-1 pr-1 pl-4 text-xs" : "py-1.5 pr-1.5 pl-5 text-sm"
  } ${PILL[tone].pill} ${className}`;

function Dot({ tone, icon, size }: { tone: keyof typeof PILL; icon: IconSvgElement; size: "sm" | "md" }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full transition group-hover:rotate-45 ${size === "sm" ? "size-7" : "size-9"} ${PILL[tone].dot}`}>
      <HugeiconsIcon icon={icon} size={size === "sm" ? 15 : 18} strokeWidth={2} />
    </span>
  );
}

/** "Label ⟶●": the main call to action, as a link. */
export function ArrowLink({ href, children, tone = "dark", icon = ArrowUpRight01Icon, className = "", size = "md", ...rest }: ArrowPillProps & Omit<ComponentProps<typeof Link>, "className" | "children">) {
  return (
    <Link href={href} className={pillClass(tone, size, className)} {...rest}>
      {children}
      <Dot tone={tone} icon={icon} size={size} />
    </Link>
  );
}

/** "Label ⟶●": the main call to action, as a button. */
export function ArrowButton({ children, tone = "dark", icon = ArrowUpRight01Icon, className = "", size = "md", ...rest }: ArrowPillProps & Omit<ComponentProps<"button">, "className" | "children">) {
  return (
    <button type="button" className={pillClass(tone, size, className)} {...rest}>
      {children}
      <Dot tone={tone} icon={icon} size={size} />
    </button>
  );
}

const ROUND: Record<Tone, string> = {
  dark: "bg-ink text-cream hover:bg-hoop",
  light: "bg-card text-ink hover:bg-ink hover:text-cream",
  clay: "bg-hoop text-cream hover:bg-hoop-soft",
  outline: "border border-ink/15 text-ink hover:border-ink hover:bg-ink hover:text-cream",
  glass: "border border-white/15 bg-black/35 text-cream backdrop-blur-md hover:bg-black/55",
};

type RoundProps = { icon: IconSvgElement; label: string; tone?: Tone; size?: number; iconSize?: number; className?: string; badge?: ReactNode };

// `relative` (for the badge) only when the caller doesn't position the button itself: in Tailwind's
// output `relative` comes after `absolute` and would win, dropping a corner button back into the flow.
const roundClass = (tone: Tone, className: string) =>
  `${/\b(absolute|fixed|sticky)\b/.test(className) ? "" : "relative "}grid shrink-0 place-items-center rounded-full transition disabled:pointer-events-none disabled:opacity-35 ${ROUND[tone]} ${className}`;

/** A round button that's only an icon (its label is for screen readers and the tooltip). */
export function IconButton({ icon, label, tone = "outline", size = 40, iconSize, className = "", badge, ...rest }: RoundProps & Omit<ComponentProps<"button">, "className" | "children">) {
  return (
    <button type="button" aria-label={label} title={label} className={roundClass(tone, className)} style={{ width: size, height: size }} {...rest}>
      <HugeiconsIcon icon={icon} size={iconSize ?? Math.round(size * 0.45)} strokeWidth={1.8} />
      {badge}
    </button>
  );
}

/** IconButton, as a link. */
export function IconLink({ icon, label, tone = "outline", size = 40, iconSize, className = "", badge, href, ...rest }: RoundProps & Omit<ComponentProps<typeof Link>, "className" | "children">) {
  return (
    <Link href={href} aria-label={label} title={label} className={roundClass(tone, className)} style={{ width: size, height: size }} {...rest}>
      <HugeiconsIcon icon={icon} size={iconSize ?? Math.round(size * 0.45)} strokeWidth={1.8} />
      {badge}
    </Link>
  );
}

/** A small outline label: "Indoor", "Solo", "Step 02". */
export function Tag({ children, tone = "outline", className = "" }: { children: ReactNode; tone?: "outline" | "dark" | "glass" | "clay" | "court"; className?: string }) {
  const t = {
    outline: "border border-ink/15 text-ink/75",
    dark: "bg-ink text-cream",
    glass: "border border-white/30 bg-white/10 text-cream backdrop-blur-sm",
    clay: "bg-hoop text-cream",
    court: "bg-court text-cream",
  }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] leading-none font-medium whitespace-nowrap ${t} ${className}`}>{children}</span>;
}
