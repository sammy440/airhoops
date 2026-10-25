"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { Photo } from "./Photo";

/** Words slide in from the edges and the card straightens as you scroll. */
export function AirMovesUs() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start end", "center center"] });

  const theX = useTransform(p, [0, 1], ["-40%", "0%"]);
  const airX = useTransform(p, [0, 1], ["60%", "0%"]);
  const movesY = useTransform(p, [0, 1], ["80%", "0%"]);
  const wordsOpacity = useTransform(p, [0, 0.5], [0, 1]);
  const cardRotate = useTransform(p, [0, 1], [-18, -5]);
  const cardScale = useTransform(p, [0, 1], [0.78, 1]);

  return (
    <section className="relative overflow-x-clip px-5 py-20 sm:px-8 sm:py-28">
      <div ref={ref} className="@container relative mx-auto aspect-[4/3.1] w-full max-w-5xl">
        <motion.span style={{ x: theX, opacity: wordsOpacity }} className="display absolute top-[6%] left-[2%] text-[17cqw] text-ink">
          The
        </motion.span>

        <motion.div style={{ rotate: cardRotate, scale: cardScale }} className="absolute top-[10%] left-[24%] h-[68%] w-[46%]">
          <div className="animate-bob h-full w-full">
            <Photo
              photo="airDunk"
              sizes="(max-width: 1024px) 50vw, 480px"
              className="h-full w-full rounded-[2rem] shadow-[0_40px_80px_-30px_rgba(14,14,13,.55)] ring-1 ring-ink/10"
            />
          </div>
        </motion.div>

        <motion.span style={{ x: airX, opacity: wordsOpacity }} className="display absolute top-[36%] right-[12%] text-[17cqw] text-hoop">
          Air
        </motion.span>
        <motion.span style={{ y: movesY, opacity: wordsOpacity }} className="display absolute bottom-[5%] left-[16%] text-[17cqw] text-hoop">
          Moves <span className="text-ink">us</span>
        </motion.span>
      </div>
    </section>
  );
}
