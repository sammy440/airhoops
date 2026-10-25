import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

/**
 * One Euro filter (Casiez et al., 2012): an adaptive low-pass filter.
 * Slow movement → low cutoff → heavy smoothing (kills jitter).
 * Fast movement → cutoff rises with speed → little lag (keeps throws snappy).
 */
export class OneEuroFilter {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;

  constructor(
    /** Hz. Lower = smoother when still. */
    public minCutoff = 1,
    /** Speed coefficient. Higher = less lag when moving fast. */
    public beta = 0,
    /** Hz. Cutoff used to smooth the derivative itself. */
    public dCutoff = 1,
  ) {}

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
  }

  /** @param tMs timestamp in milliseconds */
  filter(x: number, tMs: number): number {
    if (this.xPrev === null || !Number.isFinite(this.xPrev)) {
      this.xPrev = x;
      this.tPrev = tMs;
      return x;
    }
    // Guard against duplicate/out-of-order timestamps.
    const dt = Math.max((tMs - this.tPrev) / 1000, 1e-3);
    this.tPrev = tMs;

    const dx = (x - this.xPrev) / dt;
    const aD = smoothingFactor(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;

    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = smoothingFactor(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;

    this.xPrev = xHat;
    this.dxPrev = dxHat;
    return xHat;
  }
}

function smoothingFactor(cutoff: number, dt: number) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export interface SmoothingParams {
  minCutoff: number;
  beta: number;
}

/**
 * Tuned for MediaPipe's normalized (0..1) coordinates at ~30 fps.
 * A fast throw moves the wrist ~2–4 units/s, so beta 1.5 lifts the cutoff
 * from 1 Hz (still) to ~4–7 Hz (throwing). See CHANGELOG.md.
 */
export const DEFAULT_SMOOTHING: SmoothingParams = { minCutoff: 1.0, beta: 1.5 };

/** If tracking drops for longer than this, start fresh instead of gliding. */
const RESET_GAP_MS = 300;

/** Applies a One Euro filter to x, y and z of selected landmarks. */
export class PoseSmoother {
  private filters = new Map<number, [OneEuroFilter, OneEuroFilter, OneEuroFilter]>();
  private lastT = -Infinity;

  constructor(
    private readonly indices: readonly number[],
    private params: SmoothingParams = DEFAULT_SMOOTHING,
  ) {}

  setParams(params: SmoothingParams) {
    this.params = params;
    for (const fs of this.filters.values()) {
      for (const f of fs) {
        f.minCutoff = params.minCutoff;
        f.beta = params.beta;
      }
    }
  }

  reset() {
    this.filters.clear();
  }

  /** Returns a copy of `pose` with the tracked landmarks smoothed. */
  apply(pose: NormalizedLandmark[] | undefined, tMs: number): NormalizedLandmark[] | undefined {
    if (!pose) {
      this.reset();
      return undefined;
    }
    if (tMs - this.lastT > RESET_GAP_MS) this.reset();
    this.lastT = tMs;

    const out = pose.slice();
    for (const i of this.indices) {
      const lm = pose[i];
      if (!lm) continue;
      let fs = this.filters.get(i);
      if (!fs) {
        const { minCutoff, beta } = this.params;
        fs = [new OneEuroFilter(minCutoff, beta), new OneEuroFilter(minCutoff, beta), new OneEuroFilter(minCutoff, beta)];
        this.filters.set(i, fs);
      }
      out[i] = { ...lm, x: fs[0].filter(lm.x, tMs), y: fs[1].filter(lm.y, tMs), z: fs[2].filter(lm.z, tMs) };
    }
    return out;
  }
}
