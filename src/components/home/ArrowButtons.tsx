"use client";

export function ArrowButtons({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  const base = "grid size-9 place-items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hoop";
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label="Previous" onClick={onPrev} className={`${base} text-stone hover:text-ink`}>
        <Chevron dir="left" />
      </button>
      <button type="button" aria-label="Next" onClick={onNext} className={`${base} bg-ink text-cream hover:bg-hoop`}>
        <Chevron dir="right" />
      </button>
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}
