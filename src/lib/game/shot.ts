import type { ThrowEvent } from "@/lib/pose/throwDetector";
import { DEFAULT_COURT, idealSpeed, simulateShot, type Court, type Launch, type ShotConditions } from "./physics";

/**
 * Maps a detected throw to a ball launch (README Week 4:
 * "v = base + power * scale, direction from angle").
 *
 * The body's measured angle is noisy and mostly reflects a 2D projection
 * of a push toward the camera, so it nudges a comfortable base angle
 * rather than being used raw. Arc (how high the hands were) lifts it.
 */
export interface LaunchTuning {
  minSpeed: number;
  maxSpeed: number;
  baseAngle: number;
  /** degrees of launch angle per degree of measured throw angle away from 30° */
  angleGain: number;
  /** degrees of launch angle across the arc range */
  arcGain: number;
  minAngle: number;
  maxAngle: number;
}

export const DEFAULT_TUNING: LaunchTuning = {
  minSpeed: 5.5,
  maxSpeed: 11.5,
  baseAngle: 52,
  angleGain: 0.3,
  arcGain: 14,
  minAngle: 35,
  maxAngle: 70,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type ThrowInput = Pick<ThrowEvent, "power" | "angle" | "arc">;

export function throwToLaunch(ev: ThrowInput, tuning: LaunchTuning = DEFAULT_TUNING): Launch {
  return {
    speed: tuning.minSpeed + clamp(ev.power, 0, 1) * (tuning.maxSpeed - tuning.minSpeed),
    angle: clamp(tuning.baseAngle + (ev.angle - 30) * tuning.angleGain + (ev.arc - 0.7) * tuning.arcGain, tuning.minAngle, tuning.maxAngle),
  };
}

/** Power (0..1) that would have swished at this launch angle, for coaching. */
export function idealPower(angle: number, court: Court = DEFAULT_COURT, tuning: LaunchTuning = DEFAULT_TUNING) {
  const v = idealSpeed(angle, court);
  if (v === null) return null;
  return (v - tuning.minSpeed) / (tuning.maxSpeed - tuning.minSpeed);
}

/** Keyboard fallback: a "medium" shot that drops in from the default spot. */
export function keyboardThrow(power?: number, court: Court = DEFAULT_COURT): ThrowInput {
  const ideal = idealPower(DEFAULT_TUNING.baseAngle, court) ?? 0.4;
  return { power: power ?? ideal, angle: 30, arc: 0.7 };
}

/**
 * Range of power (0..1) that scores at this launch angle, found by simulating
 * a sweep. Drives the post-shot gauge ("you threw 31%, the make zone was
 * 38–44%"), which is what makes the throw mapping learnable.
 */
export function makeWindow(
  angle: number,
  court: Court = DEFAULT_COURT,
  tuning: LaunchTuning = DEFAULT_TUNING,
  cond: ShotConditions = {},
): { lo: number; hi: number } | null {
  let lo: number | null = null;
  let hi: number | null = null;
  for (let p = 0; p <= 1.0001; p += 0.005) {
    const speed = tuning.minSpeed + p * (tuning.maxSpeed - tuning.minSpeed);
    if (simulateShot({ speed, angle }, court, cond).result.scored) {
      lo ??= p;
      hi = p;
    } else if (lo !== null && p - (hi ?? 0) > 0.03) {
      break; // keep the main window; ignore lucky bank shots far above it
    }
  }
  return lo === null || hi === null ? null : { lo, hi };
}
