"use client";

import { motion } from "motion/react";

const EASE = [0.2, 0.8, 0.2, 1] as const;

interface Props {
  text: string;
  className?: string;
  /** Applied to every letter (e.g. a background-clip gradient) */
  charClassName?: string;
  delay?: number;
  stagger?: number;
  /** "view": animate when scrolled into view; "mount": animate on load */
  trigger?: "view" | "mount";
}

/**
 * Letters rise out of a mask, one after another. Words never break mid-word,
 * and the full string stays readable to screen readers.
 */
export function SplitText({ text, className = "", charClassName = "", delay = 0, stagger = 0.028, trigger = "view" }: Props) {
  const words = text.split(" ");
  let index = 0;

  const play = trigger === "mount" ? { animate: "show" } : { whileInView: "show", viewport: { once: true, amount: 0.4 } };

  return (
    <motion.span className={className} aria-label={text} role="text" initial="hidden" {...play}>
      {words.map((word, w) => (
        <span key={w} aria-hidden className="inline-block whitespace-nowrap">
          {/* Padding keeps tall glyphs from clipping; negative margin cancels it in layout */}
          <span className="-my-[0.12em] inline-block overflow-hidden py-[0.12em] align-bottom">
            {[...word].map((ch) => {
              const i = index++;
              return (
                <motion.span
                  key={i}
                  className={`inline-block will-change-transform ${charClassName}`}
                  variants={{
                    hidden: { y: "115%", rotate: 8 },
                    show: { y: "0%", rotate: 0, transition: { duration: 0.8, ease: EASE, delay: delay + i * stagger } },
                  }}
                >
                  {ch}
                </motion.span>
              );
            })}
          </span>
          {w < words.length - 1 && " "}
        </span>
      ))}
    </motion.span>
  );
}
