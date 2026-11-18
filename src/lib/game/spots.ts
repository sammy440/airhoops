import { DIFFICULTY_ORDER, type DifficultyId } from "./difficulty";

/**
 * Shooting-spot modes: you move between spots during the run instead of picking one
 * distance. Each spot is a difficulty level's court (free-throw line close in → deep
 * three), so it brings that level's distance, rim, wind, sensitivity, green window and
 * points multiplier with it: nothing here is tuned separately.
 *
 * - Ladder (60 s): start close in. A make moves you back a spot, a miss moves you in.
 *   Staying deep is where the points are.
 * - Rack Run (20 balls): 5 balls from each spot, near to far. The last ball of each rack
 *   is the gold ball, worth double.
 */
export type SpotModeId = "ladder" | "racks";

/** The spots, near to far. */
export const SPOTS: readonly DifficultyId[] = DIFFICULTY_ORDER;

export const isSpotMode = (mode: string): mode is SpotModeId => mode === "ladder" || mode === "racks";

/** What each spot is called on court. */
export const SPOT_NAMES: Record<DifficultyId, string> = {
  rookie: "Close in",
  starter: "Free-throw line",
  allstar: "Three-point line",
  legend: "Deep three",
};

/** Where a run starts. */
export const FIRST_SPOT: DifficultyId = SPOTS[0];

/** Ladder: the spot after a shot from `spot` (back one on a make, in one on a miss). */
export function ladderNext(spot: DifficultyId, scored: boolean): DifficultyId {
  const i = SPOTS.indexOf(spot);
  return SPOTS[Math.max(0, Math.min(SPOTS.length - 1, i + (scored ? 1 : -1)))];
}

export const RACK_BALLS = 5;
export const RACK_SHOTS = RACK_BALLS * SPOTS.length;
/** Points multiplier for a rack's last ball. */
export const GOLD_MULTIPLIER = 2;

export interface RackBall {
  spot: DifficultyId;
  /** Which rack (0-based, one per spot) */
  rack: number;
  /** Which ball of the rack (0-based) */
  ball: number;
  gold: boolean;
}

/** The ball for shot `n` (0-based) of a Rack Run, or null once all are shot. */
export function rackBall(n: number): RackBall | null {
  if (n < 0 || n >= RACK_SHOTS) return null;
  const rack = Math.floor(n / RACK_BALLS);
  const ball = n % RACK_BALLS;
  return { spot: SPOTS[rack], rack, ball, gold: ball === RACK_BALLS - 1 };
}

/** The spot for the next shot, given the shot just taken (shot `shots - 1`, from `spot`). */
export function nextSpot(mode: SpotModeId, spot: DifficultyId, shots: number, scored: boolean): DifficultyId {
  return mode === "ladder" ? ladderNext(spot, scored) : (rackBall(shots)?.spot ?? spot);
}

/**
 * Leaderboard difficulty for a spot run. The board is one per mode (no difficulty pick), but a
 * run is sent with the deepest spot's level: the server caps points per make by difficulty, and
 * the deepest spot's multiplier is the highest a make can get.
 */
export const SPOT_BOARD_DIFFICULTY: DifficultyId = SPOTS[SPOTS.length - 1];
