"use client";

import { useEffect, useState } from "react";
import { renderResultCard, type ResultCardData } from "@/lib/resultCard";
import { shareImage } from "@/lib/share";

/**
 * "Share result" as an image. The card is drawn as soon as this mounts, so a
 * tap can open the share sheet right away (phones reject shares after an await).
 * Shows a thumbnail so people see what they're about to post.
 */
export function ShareCardButton({ card, filename, text }: { card: ResultCardData; filename: string; text: string }) {
  const key = JSON.stringify(card);
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let url = "";
    renderResultCard(JSON.parse(key) as ResultCardData)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (live) setImage({ blob, url });
      })
      .catch(() => live && setStatus("Couldn't make the image"));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [key]);

  const share = async () => {
    if (!image) return;
    const r = await shareImage(image.blob, { filename, title: "AirHoops", text });
    setStatus(r === "shared" ? "Shared!" : r === "saved" ? "Image saved" : null);
  };

  return (
    <button
      type="button"
      onClick={share}
      disabled={!image}
      aria-live="polite"
      className="flex w-full items-center gap-3 rounded-full border border-cream/15 py-1.5 pr-5 pl-1.5 text-sm transition hover:border-cream/40 disabled:opacity-60"
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL, nothing for next/image to optimise
        <img src={image.url} alt="" className="h-10 w-8 shrink-0 rounded-[10px] object-cover" />
      ) : (
        <span className="h-10 w-8 shrink-0 animate-pulse rounded-[10px] bg-white/10" />
      )}
      <span className="flex-1 text-center font-semibold">{status ?? (image ? "Share result image" : "Making your card…")}</span>
    </button>
  );
}
