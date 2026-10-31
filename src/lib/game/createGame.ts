import type { GameCallbacks, GameCore } from "./engine";
import { Game } from "./game";
import { Game3D } from "./game3d";

/** "3d": the WebGL court (default). "2d": the classic side view, also the fallback without WebGL. */
export type RendererId = "3d" | "2d";

let webgl: boolean | null = null;

export function webglAvailable() {
  if (webgl === null) {
    try {
      const c = document.createElement("canvas");
      webgl = !!(c.getContext("webgl2") ?? c.getContext("webgl"));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

export const rendererId = (v: unknown): RendererId => (v === "2d" ? "2d" : "3d");

/**
 * A canvas holds one kind of context for life, so switching renderer needs a fresh
 * <canvas> (give it `key={renderer}`).
 */
export function createGame(canvas: HTMLCanvasElement, cb: GameCallbacks, renderer: RendererId): GameCore {
  if (renderer === "3d" && webglAvailable()) {
    try {
      return new Game3D(canvas, cb);
    } catch {
      // WebGL context creation can still fail (blocklisted GPU, too many contexts): fall back.
    }
  }
  return new Game(canvas, cb);
}
