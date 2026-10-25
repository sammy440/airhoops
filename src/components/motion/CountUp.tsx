"use client";

import { animate, useInView } from "motion/react";
import { useEffect, useRef } from "react";

/** Counts from 0 to `to` the first time it scrolls into view. */
export function CountUp({ to, suffix = "", className = "" }: { to: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Server HTML shows the final value (no-JS friendly); reset before it's seen.
    if (!inView) {
      el.textContent = `0${suffix}`;
      return;
    }
    const controls = animate(0, to, {
      duration: 1.6,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => (el.textContent = `${Math.round(v)}${suffix}`),
    });
    return () => controls.stop();
  }, [inView, to, suffix]);

  return (
    <span ref={ref} className={className}>
      {to}
      {suffix}
    </span>
  );
}
