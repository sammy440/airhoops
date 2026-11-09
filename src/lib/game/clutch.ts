/**
 * Clutch time: the last seconds of a timed or daily run. Makes score double. (The hoop used to
 * start sliding too; it stands still now, as it does at every level.)
 *
 * A shot is clutch by when it left the hands (run time), so a buzzer beater released in
 * clutch time scores double too. The API's solo score check allows for the doubled makes:
 * a shot takes more than a second, so at most CLUTCH_SECONDS of them (schemas.py).
 */

export const CLUTCH_SECONDS = 10;
export const CLUTCH_MULTIPLIER = 2;

/** `runTime`: seconds since GO; `seconds`: the run's clock. */
export const inClutch = (runTime: number, seconds: number) => runTime >= seconds - CLUTCH_SECONDS;
