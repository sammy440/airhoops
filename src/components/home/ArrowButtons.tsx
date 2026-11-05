"use client";

import { ArrowLeft02Icon, ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { IconButton } from "@/components/ui/Pills";

export function ArrowButtons({ onPrev, onNext, className = "" }: { onPrev: () => void; onNext: () => void; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <IconButton icon={ArrowLeft02Icon} label="Previous" onClick={onPrev} size={38} />
      <IconButton icon={ArrowRight02Icon} label="Next" tone="dark" onClick={onNext} size={38} />
    </div>
  );
}
