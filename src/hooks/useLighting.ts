"use client";

import { useEffect, useState, type RefObject } from "react";

export type LightingStatus = "ok" | "dark" | "backlit" | "unknown";

const SAMPLE_W = 32;
const SAMPLE_H = 18;
const DARK_LUMA = 55; // 0..255 average
const BACKLIT_RATIO = 1.45; // edges this much brighter than the centre

/**
 * Cheap lighting check for the "move into frame" guide: once a second, shrink
 * the camera frame to 32×18 and compare overall brightness and centre-vs-edge
 * brightness (a bright window behind the player = backlit). Stays on-device.
 */
export function useLighting(videoRef: RefObject<HTMLVideoElement | null>, enabled: boolean) {
  const [state, setState] = useState<{ status: LightingStatus; luma: number }>({ status: "unknown", luma: 0 });

  useEffect(() => {
    if (!enabled) return;
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const id = window.setInterval(() => {
      const video = videoRef.current;
      if (!ctx || !video || video.readyState < 2) return;
      ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
      const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
      let total = 0;
      let centre = 0;
      let centreN = 0;
      let edge = 0;
      let edgeN = 0;
      for (let y = 0; y < SAMPLE_H; y++) {
        for (let x = 0; x < SAMPLE_W; x++) {
          const i = (y * SAMPLE_W + x) * 4;
          const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          total += l;
          const inCentre = x > SAMPLE_W * 0.3 && x < SAMPLE_W * 0.7 && y > SAMPLE_H * 0.2;
          if (inCentre) {
            centre += l;
            centreN++;
          } else {
            edge += l;
            edgeN++;
          }
        }
      }
      const luma = total / (SAMPLE_W * SAMPLE_H);
      const ratio = edge / edgeN / Math.max(1, centre / centreN);
      setState({ luma, status: luma < DARK_LUMA ? "dark" : ratio > BACKLIT_RATIO ? "backlit" : "ok" });
    }, 1000);
    return () => window.clearInterval(id);
  }, [videoRef, enabled]);

  return enabled ? state : { status: "unknown" as const, luma: 0 };
}
