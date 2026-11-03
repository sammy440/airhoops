"use client";

import { useEffect, type RefObject } from "react";
import type { GameCore } from "@/lib/game/engine";

/** What a screen lets the court gestures do with a shot. */
export interface ChargeControls {
  /** Starts charging a shot; false if a shot can't be taken now. */
  start(): boolean;
  /** Lets go: takes the shot. */
  release(): void;
  /** Drops the charge without shooting (the press turned into a drag). */
  cancel(): void;
}

/** Movement (px) that turns a press into a drag. */
const DRAG_PX = 8;

/**
 * Mouse and touch on the court:
 * - press and hold without moving: charge a shot, release to shoot (as before);
 * - press and drag / swipe: look around the court (3D), the charge is dropped;
 * - two-finger pinch or the mouse wheel: zoom (3D).
 * `onLooked` fires when the view moves, so the screen can offer "Reset view".
 */
export function useCourtGestures(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  gameRef: RefObject<GameCore | null>,
  chargeRef: RefObject<ChargeControls | null>,
  onLooked: () => void,
  /** Changes when the engine is recreated (e.g. a renderer switch), so the listeners attach to the new canvas. */
  engine?: string,
) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let mode: "idle" | "press" | "look" | "pinch" = "idle";
    let charging = false;
    let start = { x: 0, y: 0 };
    let pinch = 0;

    const spread = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const dropCharge = () => {
      if (charging) chargeRef.current?.cancel();
      charging = false;
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      if (pointers.size === 1) {
        mode = "press";
        start = { x: e.clientX, y: e.clientY };
        charging = chargeRef.current?.start() ?? false;
      } else if (pointers.size === 2 && gameRef.current?.canLookAround) {
        dropCharge();
        gameRef.current.endLookAround();
        mode = "pinch";
        pinch = spread();
      }
    };

    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const p = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, p);
      const game = gameRef.current;
      if (!game?.canLookAround) return;
      if (mode === "press" && Math.hypot(p.x - start.x, p.y - start.y) > DRAG_PX) {
        dropCharge();
        mode = "look";
      }
      if (mode === "look") {
        game.lookAround(p.x - prev.x, p.y - prev.y);
        onLooked();
      } else if (mode === "pinch" && pointers.size === 2) {
        const d = spread();
        if (d > 0 && pinch > 0) game.zoomView(pinch / d); // fingers apart = closer
        pinch = d;
        onLooked();
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (mode === "press") {
        if (charging) chargeRef.current?.release();
        charging = false;
      }
      if (mode === "look") gameRef.current?.endLookAround();
      // Lifting one finger of a pinch doesn't start a drag or a shot; wait for both.
      if (pointers.size === 0) mode = "idle";
    };

    const onWheel = (e: WheelEvent) => {
      const game = gameRef.current;
      if (!game?.canLookAround) return;
      e.preventDefault();
      game.zoomView(Math.exp(e.deltaY * 0.0015));
      onLooked();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      dropCharge();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [canvasRef, gameRef, chargeRef, onLooked, engine]);
}
