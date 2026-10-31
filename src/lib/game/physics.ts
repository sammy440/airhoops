/**
 * Deterministic 3D basketball physics (meters).
 *
 * Axes: x = toward the hoop (the release point is x = 0), y = up, z = sideways
 * (+ = the shooter's right). A shot aimed straight with no crosswind stays in
 * the z = 0 plane and behaves exactly like the old side-view physics.
 *
 * Deliberately engine-free: a fixed-timestep integrator with sphere-vs-point
 * collisions against the nearest point of the rim ring, a backboard rectangle
 * (face + edges) and a floor. Identical inputs always produce identical shots,
 * so the server's Python port (app/game/physics.py) can re-simulate throws for
 * anti-cheat with exact parity.
 */

/** Hoop sliding sideways (z): offset(t) = amplitude · sin(2π · frequency · t). */
export interface HoopMotion {
  amplitude: number;
  frequency: number;
}

export interface Court {
  /** Horizontal distance from release point to rim centre (m) */
  hoopDistance: number;
  /** Rim height (m). Regulation 3.05 */
  rimHeight: number;
  /** Rim inner radius (m). Regulation 18" diameter → 0.2286 */
  rimRadius: number;
  /** Release height (m): hands above the head */
  releaseHeight: number;
  /** Ball radius (m). Size 7 ≈ 0.12 */
  ballRadius: number;
  /** Gap from back of rim to backboard face (m) */
  boardGap: number;
  /** Backboard bottom / top relative to rim height (m) */
  boardBottom: number;
  boardTop: number;
  /** Backboard half-width (m). Regulation 1.83 m wide */
  boardHalfWidth: number;
  gravity: number;
  hoopMotion?: HoopMotion | null;
}

/**
 * Per-shot conditions. Both are explicit inputs (never random inside the sim)
 * so a server can re-simulate the exact same shot.
 */
export interface ShotConditions {
  /** Crosswind acceleration (m/s²) along z; + pushes the ball to the shooter's right */
  wind?: number;
  /** Game clock (s) at release; positions a moving hoop */
  phase?: number;
}

/** Sideways (z) hoop offset (m) at game-clock time t (s). */
export function hoopOffset(court: Court, t: number) {
  const m = court.hoopMotion;
  return m ? m.amplitude * Math.sin(2 * Math.PI * m.frequency * t) : 0;
}

export const DEFAULT_COURT: Court = {
  hoopDistance: 4.6,
  rimHeight: 3.05,
  rimRadius: 0.2286,
  releaseHeight: 2.1,
  ballRadius: 0.12,
  boardGap: 0.15,
  boardBottom: -0.15,
  boardTop: 0.9,
  boardHalfWidth: 0.915,
  gravity: 9.81,
};

const DT = 1 / 240;
const MAX_TIME = 4.5;
const AFTER_SCORE = 1.0;
const RIM_TUBE = 0.01;
const RESTITUTION = { rim: 0.55, board: 0.65, floor: 0.62 };
const FRICTION = { rim: 0.85, floor: 0.88 };

export interface Launch {
  /** m/s */
  speed: number;
  /** degrees above horizontal */
  angle: number;
  /** degrees left (−) or right (+) of straight at the hoop; 0 if omitted */
  aim?: number;
}

export type ShotEventType = "rim" | "board" | "floor" | "score";

export interface ShotEvent {
  t: number;
  type: ShotEventType;
  x: number;
  y: number;
  z: number;
  /** Impact speed (m/s), drives sound volume */
  impact: number;
}

export type MissKind = "short" | "long" | "left" | "right" | "rim" | "airball";

export interface ShotResult {
  scored: boolean;
  /** Scored without touching rim or board */
  swish: boolean;
  /** Banked in off the board */
  bank: boolean;
  miss: MissKind | null;
  /** Signed depth error (m) where the ball first came down through rim height; + = long */
  error: number;
  /** Signed sideways error (m) at the same moment; + = right */
  lateral: number;
}

export interface ShotSim {
  launch: Launch;
  /** Samples every SAMPLE_EVERY steps: [t, x, y, z] */
  path: PathPoint[];
  events: ShotEvent[];
  result: ShotResult;
  duration: number;
}

export type PathPoint = [t: number, x: number, y: number, z: number];

const SAMPLE_EVERY = 2; // 120 Hz path samples: smooth playback, small payload

interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/**
 * Bounce off a fixed point (the nearest point of the rim tube or a board edge) if overlapping.
 * The normal part of the velocity reflects with restitution, the tangential part keeps `friction`.
 * Returns the impact speed, or 0.
 */
function collidePoint(b: Ball, px: number, py: number, pz: number, r: number, restitution: number, friction: number): number {
  const dx = b.x - px;
  const dy = b.y - py;
  const dz = b.z - pz;
  const dist = len3(dx, dy, dz);
  const minDist = r + RIM_TUBE;
  if (dist >= minDist || dist === 0) return 0;
  const nx = dx / dist;
  const ny = dy / dist;
  const nz = dz / dist;
  b.x = px + nx * minDist;
  b.y = py + ny * minDist;
  b.z = pz + nz * minDist;
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  if (vn >= 0) return 0; // already separating
  // v = vn·n + vt (tangential); new v = −e·vn·n + f·vt
  const tx = b.vx - vn * nx;
  const ty = b.vy - vn * ny;
  const tz = b.vz - vn * nz;
  const newVn = -vn * restitution;
  b.vx = newVn * nx + tx * friction;
  b.vy = newVn * ny + ty * friction;
  b.vz = newVn * nz + tz * friction;
  return -vn;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** sqrt of a sum of squares, not Math.hypot: IEEE sqrt rounds the same in JS and Python, hypot may not. */
const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);

export function simulateShot(launch: Launch, court: Court = DEFAULT_COURT, cond: ShotConditions = {}): ShotSim {
  const c = court;
  const wind = cond.wind ?? 0;
  const phase = cond.phase ?? 0;
  const r = c.ballRadius;
  const el = (launch.angle * Math.PI) / 180;
  const az = ((launch.aim ?? 0) * Math.PI) / 180;
  const flat = launch.speed * Math.cos(el);
  const b: Ball = { x: 0, y: c.releaseHeight, z: 0, vx: flat * Math.cos(az), vy: launch.speed * Math.sin(el), vz: flat * Math.sin(az) };

  const boardLo = c.rimHeight + c.boardBottom;
  const boardHi = c.rimHeight + c.boardTop;
  const boardX = c.hoopDistance + c.rimRadius + c.boardGap;

  const path: PathPoint[] = [[0, b.x, b.y, b.z]];
  const events: ShotEvent[] = [];
  let touchedRim = false;
  let touchedBoard = false;
  let scoredAt: number | null = null;
  let descent: { x: number; z: number; hoopZ: number } | null = null;
  let t = 0;
  let step = 0;
  let lastFloor = -1;

  while (t < MAX_TIME) {
    const prevY = b.y;
    // Moving hoop: rim and board slide sideways together.
    const hoopZ = hoopOffset(c, phase + t);
    b.vz += wind * DT;
    b.vy -= c.gravity * DT;
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.z += b.vz * DT;
    t = ++step * DT;

    // Rim: the nearest point of the ring (radius rimRadius around the hoop centre, at rim height).
    const hx = b.x - c.hoopDistance;
    const hz = b.z - hoopZ;
    const ringDist = len3(hx, 0, hz);
    if (ringDist > 0) {
      const px = c.hoopDistance + (hx / ringDist) * c.rimRadius;
      const pz = hoopZ + (hz / ringDist) * c.rimRadius;
      const impact = collidePoint(b, px, c.rimHeight, pz, r, RESTITUTION.rim, FRICTION.rim);
      if (impact > 0.3) {
        touchedRim = true;
        events.push({ t, type: "rim", x: px, y: c.rimHeight, z: pz, impact });
      }
    }

    // Backboard face (approached from the court side), then its edges.
    const zLo = hoopZ - c.boardHalfWidth;
    const zHi = hoopZ + c.boardHalfWidth;
    if (b.x + r > boardX && b.x - r < boardX + 0.05 && b.y > boardLo && b.y < boardHi && b.z > zLo && b.z < zHi && b.vx > 0) {
      const impact = b.vx;
      b.x = boardX - r;
      b.vx = -b.vx * RESTITUTION.board;
      touchedBoard = true;
      events.push({ t, type: "board", x: boardX, y: b.y, z: b.z, impact });
    }
    // Edges: nearest point on the rectangle's outline (bottom, top, left, right).
    for (const [py, pz] of [
      [boardLo, clamp(b.z, zLo, zHi)],
      [boardHi, clamp(b.z, zLo, zHi)],
      [clamp(b.y, boardLo, boardHi), zLo],
      [clamp(b.y, boardLo, boardHi), zHi],
    ]) {
      const impact = collidePoint(b, boardX, py, pz, r, RESTITUTION.rim, FRICTION.rim);
      if (impact > 0.3) {
        touchedBoard = true;
        events.push({ t, type: "board", x: boardX, y: py, z: pz, impact });
      }
    }

    if (b.y - r < 0) {
      const impact = -b.vy;
      b.y = r;
      b.vy = -b.vy * RESTITUTION.floor;
      b.vx *= FRICTION.floor;
      b.vz *= FRICTION.floor;
      if (impact > 0.5 && t - lastFloor > 0.05) {
        events.push({ t, type: "floor", x: b.x, y: 0, z: b.z, impact });
        lastFloor = t;
      }
    }

    // Crossing rim height on the way down: through the ring scores.
    if (prevY >= c.rimHeight && b.y < c.rimHeight && b.vy < 0) {
      descent ??= { x: b.x, z: b.z, hoopZ };
      if (scoredAt === null && len3(b.x - c.hoopDistance, 0, b.z - hoopZ) < c.rimRadius - RIM_TUBE) {
        scoredAt = t;
        events.push({ t, type: "score", x: b.x, y: c.rimHeight, z: b.z, impact: len3(b.vx, b.vy, b.vz) });
      }
    }

    if (step % SAMPLE_EVERY === 0) path.push([round(t), round(b.x), round(b.y), round(b.z)]);

    const settled = b.y <= r + 1e-3 && Math.abs(b.vy) < 0.4;
    if ((scoredAt !== null && t - scoredAt > AFTER_SCORE) || b.x < -2 || b.x > c.hoopDistance + 4 || Math.abs(b.z) > 6 || (settled && t > 0.5)) break;
  }

  const scored = scoredAt !== null;
  const error = (descent?.x ?? b.x) - c.hoopDistance;
  const lateral = (descent?.z ?? b.z) - (descent?.hoopZ ?? 0);
  let miss: MissKind | null = null;
  if (!scored) {
    if (touchedRim) miss = "rim";
    else if (touchedBoard) miss = "long";
    else if (descent === null) miss = len3(error, 0, lateral) > 1 ? "airball" : "short";
    // Mostly wide: left / right (way wide is an airball).
    else if (Math.abs(lateral) > Math.abs(error)) miss = Math.abs(lateral) > 1 ? "airball" : lateral > 0 ? "right" : "left";
    else if (error < -c.rimRadius - r) miss = Math.abs(error) > 1 ? "airball" : "short";
    else miss = "long";
  }

  return {
    launch,
    path,
    events,
    result: { scored, swish: scored && !touchedRim && !touchedBoard, bank: scored && touchedBoard, miss, error, lateral },
    duration: t,
  };
}

const round = (n: number) => Math.round(n * 1e4) / 1e4;

/**
 * Closed-form speed that drops the ball through the rim centre at `angle`
 * (ignoring collisions). Used for the "you needed X% power" coaching hint.
 * Returns null if the angle can't reach the rim.
 */
export function idealSpeed(angle: number, court: Court = DEFAULT_COURT): number | null {
  const th = (angle * Math.PI) / 180;
  const x = court.hoopDistance;
  const dy = court.rimHeight - court.releaseHeight;
  const denom = 2 * Math.cos(th) ** 2 * (x * Math.tan(th) - dy);
  if (denom <= 0) return null;
  return Math.sqrt((court.gravity * x * x) / denom);
}
