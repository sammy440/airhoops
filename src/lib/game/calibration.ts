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
 *
 * The arm's speed is measured relative to the shoulders, and the jump separately:
 * jumping harder than you did in practice throws further (JUMP_GAIN), less than
 * usual throws shorter. So jumping isn't needed to score, but it's how you add
 * distance.
 *
 * Version 2 (arm speed + jump). Version 1 stored wrist speed with the jump mixed
 * in, so it isn't loaded: those players calibrate once more.
 */
export interface Calibration {
  version: 2;
  /** Arm speeds (torso/s, relative to the shoulders) of the practice throws */
  samples: number[];
  avg: number;
  min: number;
  max: number;
  /** How hard each practice throw jumped (0..1), and the average */
  jumps: number[];
  jumpAvg: number;
  /** The player's lean when throwing straight (aim.ts), null if the camera couldn't see it */
  leanCenter: number | null;
  hand: Side;
  createdAt: string;
}

/** Launch speed added per unit of jump above your practice jumps (a full jump over none: +12%). */
export const JUMP_GAIN = 0.12;

export const CALIBRATION_THROWS = 3;
const STORAGE_KEY = "airhoops.calibration";

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/** A practice throw: arm speed (torso/s), jump (0..1) and lean (torso lengths, null if unseen). */
export interface PracticeThrow {
  speed: number;
  jump: number;
  lean: number | null;
}

/** Practice throws are straight, so their median lean is the player's "straight". */
export function calibrate(throws: PracticeThrow[], hand: Side, now = new Date()): Calibration {
  if (!throws.length) throw new Error("No calibration samples");
  const samples = throws.map((t) => t.speed);
  const jumps = throws.map((t) => t.jump);
  const leans = throws.map((t) => t.lean).filter((l): l is number => l !== null).sort((a, b) => a - b);
  return {
    version: 2,
    samples,
    avg: mean(samples),
    min: Math.min(...samples),
    max: Math.max(...samples),
    jumps,
    jumpAvg: mean(jumps),
    leanCenter: leans.length ? leans[Math.floor(leans.length / 2)] : null,
    hand,
    createdAt: now.toISOString(),
  };
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
  ev: Pick<ThrowEvent, "armSpeed" | "jump" | "angle" | "arc"> & { aim?: number },
  cal: Calibration,
  court: Court,
  difficulty: Difficulty,
): { launch: Launch; power: number } {
  const t = DEFAULT_TUNING;
  const vStar = idealSpeed(t.baseAngle, court) ?? (t.minSpeed + t.maxSpeed) / 2;
  const ratio = ev.armSpeed / cal.avg;
  const lift = 1 + JUMP_GAIN * (ev.jump - cal.jumpAvg);
  const speed = Math.min(t.maxSpeed * 1.2, Math.max(t.minSpeed * 0.6, vStar * (1 + difficulty.sensitivity * (ratio - 1)) * lift));
  const { angle, aim } = throwToLaunch({ power: 0.5, angle: ev.angle, arc: ev.arc, aim: ev.aim });
  return { launch: { speed, angle, aim }, power: (speed - t.minSpeed) / (t.maxSpeed - t.minSpeed) };
}

export function loadCalibration(): Calibration | null {
  try {
    const c = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return c?.version === 2 && c.avg > 0 ? c : null;
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
