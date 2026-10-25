"use client";

import { motion, type TargetAndTransition } from "motion/react";
import type { ReactNode } from "react";

const EASE = [0.2, 0.8, 0.2, 1] as const;

/** Animates from `from` to its natural state the first time it enters view. */
export function Appear({
  children,
  className,
  from = { y: 40 },
  delay = 0,
  duration = 0.9,
}: {
  children: ReactNode;
  className?: string;
  from?: TargetAndTransition;
  delay?: number;
  duration?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, ...from }}
      whileInView={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/** The stacked cards behind the featured photo fan out once in view. */
export function FanStack({ children, className }: { children: ReactNode; className?: string }) {
  const layer = (x: number, y: number, rotate: number, cls: string, delay: number) => (
    <motion.div
      className={`absolute inset-0 rounded-2xl ${cls}`}
      initial={{ x: 0, y: 0, rotate: 0 }}
      whileInView={{ x, y, rotate }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ type: "spring", stiffness: 90, damping: 14, delay }}
    />
  );
  return (
    <div className={`relative ${className ?? ""}`}>
      {layer(16, -16, 5, "bg-hoop-soft/50", 0.25)}
      {layer(8, -8, 2.5, "bg-sun/70", 0.15)}
      <Appear from={{ y: 50, rotate: -6 }}>{children}</Appear>
    </div>
  );
}
