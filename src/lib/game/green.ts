import { DEFAULT_COURT, hoopOffset, idealSpeed, simulateShot, type Court, type Launch, type ShotConditions } from "./physics";

/**
 * The green rim (camera play): a light loops around the rim every GREEN_CYCLE_S seconds, and
 * while it passes the front (the side nearest the shooter) the rim turns green. A camera throw
 * released then swishes, however it was thrown (`greenLaunch` finds the shot). Any other time,
 * a throw flies exactly as thrown.
 *
 * Timed on the hoop-motion phase (the run's clock solo, the match clock in multiplayer), so the
 * server sees the same green as the screen. Mirrored line for line by the backend's
 * app/game/green.py (checked by the parity fixtures).
 */

export const GREEN_CYCLE_S = 3;

/** Where the light is on its loop, 0..1; 0.5 = the front of the rim. */
export function greenLoop(phase: number) {
  const r = phase % GREEN_CYCLE_S;
  return (r < 0 ? r + GREEN_CYCLE_S : r) / GREEN_CYCLE_S; // as Python's %, so the server agrees to the last bit
}

/** The rim is green: the light is within half the window of the front. */
export function isGreen(phase: number, window: number) {
  return Math.abs(greenLoop(phase) * GREEN_CYCLE_S - GREEN_CYCLE_S / 2) <= window / 2;
}

/** Seconds until the rim next turns green (0 while it is). */
export function untilGreen(phase: number, window: number) {
  if (isGreen(phase, window)) return 0;
  const t = greenLoop(phase) * GREEN_CYCLE_S;
  const start = GREEN_CYCLE_S / 2 - window / 2;
  return t < start ? start - t : GREEN_CYCLE_S - t + start;
}

const ANGLE = 52;
/** Wider than a thrown shot's ±12°: on Legend, full wind plus the hoop at the end of its slide needs ~14°. */
const MAX_AIM = 20;
/** Speed nudges (fraction) and aim nudges (degrees) tried, in this order, until one swishes. */
const SPEED_STEPS = [0, 0.005, -0.005, 0.01, -0.01, 0.015, -0.015, 0.02, -0.02, 0.03, -0.03, 0.04, -0.04];
const AIM_STEPS = [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1, -1, 1.5, -1.5, 2, -2];

/**
 * A launch that swishes under these conditions (wind, where the hoop will be), or, failing
 * that, one that scores; null if neither is found. Deterministic: the server repeats it.
 */
export function greenLaunch(court: Court = DEFAULT_COURT, cond: ShotConditions = {}): Launch | null {
  const v0 = idealSpeed(ANGLE, court);
  if (v0 === null) return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  const wind = cond.wind ?? 0;
  const phase = cond.phase ?? 0;
  // Aim so the ball arrives where the hoop will be, allowing for the wind (as coachShot does), refined a few times.
  let aim = 0;
  for (let i = 0; i < 4; i++) {
    const flat = v0 * Math.cos(rad(ANGLE));
    const vx = flat * Math.cos(rad(aim));
    const vz = flat * Math.sin(rad(aim));
    const t = court.hoopDistance / vx;
    const miss = vz * t + 0.5 * wind * t * t - hoopOffset(court, phase + t);
    aim = Math.min(MAX_AIM, Math.max(-MAX_AIM, aim - (Math.atan2(miss, court.hoopDistance) * 180) / Math.PI));
  }
  let make: Launch | null = null;
  for (const ds of SPEED_STEPS) {
    for (const da of AIM_STEPS) {
      const launch = { speed: v0 * (1 + ds), angle: ANGLE, aim: Math.min(MAX_AIM, Math.max(-MAX_AIM, aim + da)) };
      const r = simulateShot(launch, court, cond).result;
      if (r.swish) return launch;
      if (r.scored) make ??= launch;
    }
  }
  return make;
}

/** The tick comes this long (s) before the rim lights: about a throw's length, so it's time to go. */
export const GREEN_SOON_S = 0.5;

/**
 * Which green-rim sound to play as the countdown moves from `prev` to `next` (seconds until green,
 * 0 = green now, null = can't throw). Once a loop each: "soon" as it crosses GREEN_SOON_S, "on" as it lights.
 */
export function greenSounds(prev: number | null, next: number | null): "soon" | "on" | null {
  if (next === null) return null;
  if (next === 0) return prev === 0 ? null : "on";
  if (next <= GREEN_SOON_S && (prev === null || prev === 0 || prev > GREEN_SOON_S)) return "soon";
  return null;
}
