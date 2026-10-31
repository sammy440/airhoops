import type { ThrowEvent } from "@/lib/pose/throwDetector";
import { DEFAULT_COURT, hoopOffset, idealSpeed, simulateShot, type Court, type Launch, type ShotConditions } from "./physics";

/**
 * Maps a detected throw to a ball launch: speed from power, elevation from angle,
 * left/right from aim.
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
  /** degrees of launch aim per degree of the throw's sideways angle */
  aimGain: number;
  /** launch aim limit, degrees either side */
  maxAim: number;
}

export const DEFAULT_TUNING: LaunchTuning = {
  minSpeed: 5.5,
  maxSpeed: 11.5,
  baseAngle: 52,
  angleGain: 0.3,
  arcGain: 14,
  minAngle: 35,
  maxAngle: 70,
  // Placeholder until aim from the camera is tuned against recordings (3D stage 2).
  aimGain: 0.3,
  maxAim: 12,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** `aim`: the throw's sideways angle in degrees (+ = right); 0 if the input has none. */
export type ThrowInput = Pick<ThrowEvent, "power" | "angle" | "arc"> & { aim?: number };

export const launchAim = (aim: number, tuning: LaunchTuning = DEFAULT_TUNING) => clamp(aim * tuning.aimGain, -tuning.maxAim, tuning.maxAim);

/** The throw aim that produces this launch aim (keyboard play sends launch aims this way). */
export const throwAimFor = (launch: number, tuning: LaunchTuning = DEFAULT_TUNING) => clamp(launch, -tuning.maxAim, tuning.maxAim) / tuning.aimGain;

export function throwToLaunch(ev: ThrowInput, tuning: LaunchTuning = DEFAULT_TUNING): Launch {
  return {
    speed: tuning.minSpeed + clamp(ev.power, 0, 1) * (tuning.maxSpeed - tuning.minSpeed),
    angle: clamp(tuning.baseAngle + (ev.angle - 30) * tuning.angleGain + (ev.arc - 0.7) * tuning.arcGain, tuning.minAngle, tuning.maxAngle),
    aim: launchAim(ev.aim ?? 0, tuning),
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
  return { power: power ?? ideal, angle: 30, arc: 0.7, aim: 0 };
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
  aim = 0,
): { lo: number; hi: number } | null {
  let lo: number | null = null;
  let hi: number | null = null;
  for (let p = 0; p <= 1.0001; p += 0.005) {
    const speed = tuning.minSpeed + p * (tuning.maxSpeed - tuning.minSpeed);
    if (simulateShot({ speed, angle, aim }, court, cond).result.scored) {
      lo ??= p;
      hi = p;
    } else if (lo !== null && p - (hi ?? 0) > 0.03) {
      break; // keep the main window; ignore lucky bank shots far above it
    }
  }
  return lo === null || hi === null ? null : { lo, hi };
}

export interface Coaching {
  /** Power (0..1) range that scores with the direction put right, or null if no power does at this arc */
  window: { lo: number; hi: number } | null;
  /** Launch aim (degrees, + = right) that would have gone through the middle of the rim */
  aimTarget: number;
  /** How far either side of aimTarget still goes in (degrees) */
  aimTolerance: number;
}

/**
 * Post-shot coaching in 3D: direction and distance, judged separately.
 *
 * Direction: where the ball was heading as it reached the hoop, before any rim or board
 * could deflect it. Nothing pushes the ball along x, so it gets there at t = d / vx;
 * by then aim and crosswind have moved it sideways by vz·t + ½·wind·t², and a moving
 * hoop has slid to hoopOffset(phase + t). That miss becomes the aim change that would
 * have centred it. Distance: the make window for power with that change applied, so a
 * shot that was only wide doesn't get told its power was wrong.
 */
export function coachShot(
  launch: Launch,
  court: Court = DEFAULT_COURT,
  tuning: LaunchTuning = DEFAULT_TUNING,
  cond: ShotConditions = {},
): Coaching {
  const aim = launch.aim ?? 0;
  const rad = (d: number) => (d * Math.PI) / 180;
  const deg = (r: number) => (r * 180) / Math.PI;
  const flat = launch.speed * Math.cos(rad(launch.angle));
  const vx = flat * Math.cos(rad(aim));
  const vz = flat * Math.sin(rad(aim));
  const t = court.hoopDistance / Math.max(1e-6, vx);
  const miss = vz * t + 0.5 * (cond.wind ?? 0) * t * t - hoopOffset(court, (cond.phase ?? 0) + t);
  const aimTarget = clamp(aim - deg(Math.atan2(miss, court.hoopDistance)), -tuning.maxAim, tuning.maxAim);
  const aimTolerance = deg(Math.atan2(court.rimRadius - court.ballRadius, court.hoopDistance));
  return { window: makeWindow(launch.angle, court, tuning, cond, aimTarget), aimTarget, aimTolerance };
}