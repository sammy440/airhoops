/**
 * Aiming left/right by leaning: shift your shoulders sideways over your hips.
 *
 * Why lean: a webcam reads it from image x / y alone, and in the lab it held still
 * on straight throws (sd ≈ 0.015 torso lengths) while deliberate leans moved it
 * 0.04–0.06 either way. Turning the body (MediaPipe depth) was far too noisy, and
 * the wrist's sideways path varied ±10° on straight throws.
 *
 * "Straight" is the player's own lean when throwing straight (posture and camera
 * angle shift it: −0.05 in the lab), learned in calibration, or, uncalibrated, a
 * running average of their recent throws.
 *
 * Tuned on the Oct 31 lean recordings: with these numbers 6 of 7 straight throws
 * stayed within ±1.3° (still a make), and the two lean clips aimed opposite ways
 * (10 of 12 and 9 of 9). Their labels can't be trusted for the direction (the
 * preview is mirrored, so "left" was probably the screen's left): the sign comes
 * from the geometry instead. Camera frames reach MediaPipe unmirrored, and in the
 * recordings the right wrist sits on the image's left: a player's right is the
 * image's left.
 */

/** Lean (torso lengths) inside which a throw counts as straight. */
export const LEAN_DEADZONE = 0.01;
/** Launch aim, degrees per torso length of lean beyond the dead zone. */
export const LEAN_GAIN = 100;
/** The steepest aim leaning can give (matches the shot tuning's maxAim). */
export const MAX_LEAN_AIM = 12;

/**
 * Launch aim in degrees (+ = right) for a lean, relative to the player's straight lean.
 * Lean is measured in image x, and the player's right is the image's left, so leaning
 * right lowers it.
 */
export function leanAim(lean: number | null, center: number): number {
  if (lean === null || !Number.isFinite(lean)) return 0;
  const d = center - lean; // + = leaning to the player's right
  const beyond = Math.abs(d) - LEAN_DEADZONE;
  if (beyond <= 0) return 0;
  return Math.sign(d) * Math.min(MAX_LEAN_AIM, beyond * LEAN_GAIN);
}

/**
 * The player's "straight" lean: fixed by calibration, else learned from their throws
 * (an average that follows slowly, so one aimed shot barely moves it).
 */
export class AimCenter {
  private learned: number | null = null;

  constructor(private calibrated: number | null = null) {}

  setCalibrated(center: number | null) {
    this.calibrated = center;
  }

  get value() {
    return this.calibrated ?? this.learned ?? 0;
  }

  /** Feed each throw's lean (ignored once calibrated). */
  observe(lean: number | null) {
    if (this.calibrated !== null || lean === null || !Number.isFinite(lean)) return;
    this.learned = this.learned === null ? lean : this.learned + 0.2 * (lean - this.learned);
  }
}
