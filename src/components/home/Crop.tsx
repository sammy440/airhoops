import Image from "next/image";
import { HERO_IMAGE } from "@/lib/images";

/** Named focal points inside the hero photo, as [x%, y%]. */
export const FOCUS = {
  swish: [30, 45],
  ball: [23, 67],
  net: [37, 36],
  rim: [45, 10],
  backboard: [10, 18],
  crowd: [78, 55],
} as const;

interface Props {
  focus?: keyof typeof FOCUS;
  zoom?: number;
  className?: string;
  imgClassName?: string;
  sizes?: string;
  priority?: boolean;
}

/** A zoomed-in crop of the hero photo, so one image can carry the whole page. */
export function Crop({ focus = "swish", zoom = 1, className = "", imgClassName = "", sizes = "33vw", priority }: Props) {
  const [x, y] = FOCUS[focus];
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <Image
        src={HERO_IMAGE}
        alt=""
        fill
        sizes={sizes}
        priority={priority}
        className={`object-cover ${imgClassName}`}
        style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${zoom})`, transformOrigin: `${x}% ${y}%` }}
      />
    </div>
  );
}
