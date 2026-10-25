"use client";

import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef, type ReactNode } from "react";

export type Segment = { text: string; highlight?: boolean } | { node: ReactNode };

/**
 * Text that "fills in" word by word as it scrolls through the viewport.
 * Highlighted words also warm from grey to brand red.
 */
export function ScrollWords({ segments, className = "" }: { segments: Segment[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });

  // Flatten into words so each one gets its own slice of the scroll range.
  const items: ({ word: string; highlight?: boolean } | { node: ReactNode })[] = [];
  for (const s of segments) {
    if ("node" in s) items.push(s);
    else for (const word of s.text.split(" ").filter(Boolean)) items.push({ word, highlight: s.highlight });
  }
  const n = items.length;
  const plain = segments.map((s) => ("text" in s ? s.text : "")).join(" ").replace(/\s+/g, " ");

  return (
    <div ref={ref} className={className} aria-label={plain} role="text">
      {items.map((item, i) => {
        const range: [number, number] = [i / n, Math.min(1, (i + 1.5) / n)];
        return (
          <span key={i} aria-hidden>
            {"node" in item ? (
              <Pop progress={scrollYProgress} range={range}>{item.node}</Pop>
            ) : (
              <Word progress={scrollYProgress} range={range} highlight={item.highlight}>
                {item.word}
              </Word>
            )}{" "}
          </span>
        );
      })}
    </div>
  );
}

function Word({ children, progress, range, highlight }: { children: string; progress: MotionValue<number>; range: [number, number]; highlight?: boolean }) {
  const opacity = useTransform(progress, range, [0.16, 1]);
  const color = useTransform(progress, range, highlight ? ["#a29a86", "#ea3a1d"] : ["#a29a86", "#a29a86"]);
  return <motion.span style={{ opacity, color }}>{children}</motion.span>;
}

function Pop({ children, progress, range }: { children: ReactNode; progress: MotionValue<number>; range: [number, number] }) {
  const scale = useTransform(progress, range, [0.4, 1]);
  const rotate = useTransform(progress, range, [-12, 0]);
  return (
    <motion.span className="inline-block" style={{ scale, rotate }}>
      {children}
    </motion.span>
  );
}
