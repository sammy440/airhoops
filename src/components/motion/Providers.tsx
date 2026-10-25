"use client";

import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { MotionConfig } from "motion/react";
import { useEffect, type ReactNode } from "react";

/**
 * App-wide motion setup:
 * - Lenis inertia scrolling (skipped when the user prefers reduced motion)
 * - Motion respects the OS "reduce motion" setting
 */
export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({
      autoRaf: true,
      lerp: 0.09,
      anchors: { offset: -16 },
      // Let horizontal carousels keep native swiping.
      allowNestedScroll: true,
    });
    return () => lenis.destroy();
  }, []);

  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
