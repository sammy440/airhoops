import Image from "next/image";
import { PHOTOS, type PhotoKey } from "@/lib/images";

interface Props {
  photo: PhotoKey;
  className?: string;
  imgClassName?: string;
  sizes?: string;
  /** Decorative images (e.g. inline text tiles) get an empty alt */
  decorative?: boolean;
}

/** A cover-cropped photo from the registry in lib/images.ts. */
export function Photo({ photo, className = "", imgClassName = "", sizes = "33vw", decorative }: Props) {
  const p = PHOTOS[photo];
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <Image
        src={p.src}
        alt={decorative ? "" : p.alt}
        fill
        sizes={sizes}
        placeholder="blur"
        className={`object-cover ${imgClassName}`}
        style={{ objectPosition: "position" in p ? p.position : undefined }}
      />
    </div>
  );
}
