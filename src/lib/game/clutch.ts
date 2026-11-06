import type { GhostShot } from "./ghostRun";
import type { Court, HoopMotion } from "./physics";

/**
 * Clutch time: the last seconds of a timed or daily run. Makes score double, and a hoop
 * that was standing still starts to slide (one that already slides keeps going).
 *
 * A shot is clutch by when it left the hands (run time), so a buzzer beater released in
 * clutch time scores double too. The API's solo score check allows for the doubled makes:
 * a shot takes more than a second, so at most CLUTCH_SECONDS of them (schemas.py).
 */

export const CLUTCH_SECONDS = 10;
export const CLUTCH_MULTIPLIER = 2;
/** Slower and narrower than All-Star's slide (0.45 m at 0.22 Hz): a late twist, not a new difficulty */
export const CLUTCH_SLIDE = { amplitude: 0.3, frequency: 0.15 };

/** `runTime`: seconds since GO; `seconds`: the run's clock. */
export const inClutch = (runTime: number, seconds: number) => runTime >= seconds - CLUTCH_SECONDS;

/** The hoop's motion in clutch time, starting from the middle at hoop phase `from`. */
export const clutchMotion = (court: Court, from: number): HoopMotion | null => court.hoopMotion ?? { ...CLUTCH_SLIDE, from };

/**
 * The court a shot of a run was thrown on: the run's court, with clutch time's motion for
 * shots in it. Hoop phase and run time tick together, so the shot itself says where
 * clutch time began in hoop phase.
 */
export function shotCourt(court: Court, shot: Pick<GhostShot, "t" | "phase">, seconds: number): Court {
  if (!inClutch(shot.t, seconds) || court.hoopMotion) return court;
  return { ...court, hoopMotion: clutchMotion(court, shot.phase - shot.t + seconds - CLUTCH_SECONDS) };
}
