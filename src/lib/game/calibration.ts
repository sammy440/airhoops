import type { Side } from "@/lib/pose/kinematics";
import type { ThrowEvent } from "@/lib/pose/throwDetector";
import type { Difficulty } from "./difficulty";
import { idealSpeed, type Court, type Launch } from "./physics";
import { DEFAULT_TUNING, throwToLaunch } from "./shot";

/**
 * Per-player calibration: learn the player's natural throw
 * from 3 practice shots, then map *their* average throw to the ideal speed
 * for whatever hoop they face. Throwing harder/softer than your own average
 * sends the ball long/short; difficulty sets how much that matters.
 */
export interface Calibration {
  version: 1;
  /** Peak wrist speeds (torso/s) of the practice throws */
  samples: number[];
  avg: number;
  min: number;
  max: number;
  hand: Side;
  createdAt: string;
}

export const CALIBRATION_THROWS = 3;
const STORAGE_KEY = "airhoops.calibration";

export function calibrate(samples: number[], hand: Side, now = new Date()): Calibration {
  if (!samples.length) throw new Error("No calibration samples");
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { version: 1, samples, avg, min: Math.min(...samples), max: Math.max(...samples), hand, createdAt: now.toISOString() };
}

/** Spread of the practice throws relative to the average (0.1 = ±10%). */
export function consistency(c: Calibration) {
  return (c.max - c.min) / 2 / c.avg;
}

/**
 * True if a new practice throw is wildly off the others (e.g. a twitch got
 * detected), so the UI can offer a redo. Needs ≥2 earlier samples.
 */
export function isOutlier(samples: number[], value: number) {
  if (samples.length < 2) return false;
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return value > median * 1.8 || value < median / 1.8;
}

export function calibratedLaunch(
  ev: Pick<ThrowEvent, "peakSpeed" | "angle" | "arc">,
  cal: Calibration,
  court: Court,
  difficulty: Difficulty,
): { launch: Launch; power: number } {
  const t = DEFAULT_TUNING;
  const vStar = idealSpeed(t.baseAngle, court) ?? (t.minSpeed + t.maxSpeed) / 2;
  const ratio = ev.peakSpeed / cal.avg;
  const speed = Math.min(t.maxSpeed * 1.2, Math.max(t.minSpeed * 0.6, vStar * (1 + difficulty.sensitivity * (ratio - 1))));
  const angle = throwToLaunch({ power: 0.5, angle: ev.angle, arc: ev.arc }).angle;
  return { launch: { speed, angle }, power: (speed - t.minSpeed) / (t.maxSpeed - t.minSpeed) };
}

export function loadCalibration(): Calibration | null {
  try {
    const c = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return c?.version === 1 && c.avg > 0 ? c : null;
  } catch {
    return null;
  }
}

export function saveCalibration(c: Calibration | null) {
  try {
    if (c) localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
