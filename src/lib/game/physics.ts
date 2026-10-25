/**
 * Deterministic 2D basketball physics (side view, meters, y up).
 *
 * Deliberately engine-free: a fixed-timestep integrator with circle-vs-point
 * rim collisions, a backboard and a floor. Identical inputs always produce
 * identical shots, so Week 7's server (Python) can port this line-for-line
 * and re-simulate throws for anti-cheat with exact parity.
 */

/** Hoop sliding side to side: offset(t) = amplitude · sin(2π · frequency · t). */
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
  gravity: number;
  hoopMotion?: HoopMotion | null;
}

/**
 * Per-shot conditions. Both are explicit inputs (never random inside the sim)
 * so a server can re-simulate the exact same shot.
 */
export interface ShotConditions {
  /** Horizontal wind acceleration (m/s²); + pushes toward/past the hoop */
  wind?: number;
  /** Game clock (s) at release; positions a moving hoop */
  phase?: number;
}

/** Horizontal hoop offset (m) at game-clock time t (s). */
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
}

export type ShotEventType = "rim" | "board" | "floor" | "score";

export interface ShotEvent {
  t: number;
  type: ShotEventType;
  x: number;
  y: number;
  /** Impact speed (m/s), drives sound volume */
  impact: number;
}

export type MissKind = "short" | "long" | "rim" | "airball";

export interface ShotResult {
  scored: boolean;
  /** Scored without touching rim or board */
  swish: boolean;
  /** Banked in off the board */
  bank: boolean;
  miss: MissKind | null;
  /** Signed horizontal error (m) where the ball first came down through rim height; + = long */
  error: number;
}

export interface ShotSim {
  launch: Launch;
  /** Samples every SAMPLE_EVERY steps: [t, x, y] */
  path: [number, number, number][];
  events: ShotEvent[];
  result: ShotResult;
  duration: number;
}

const SAMPLE_EVERY = 2; // 120 Hz path samples: smooth playback, small payload

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Bounce off a fixed point (rim tube cross-section) if overlapping. Returns impact speed or 0. */
function collidePoint(b: Ball, px: number, py: number, r: number): number {
  const dx = b.x - px;
  const dy = b.y - py;
  const dist = Math.hypot(dx, dy);
  const minDist = r + RIM_TUBE;
  if (dist >= minDist || dist === 0) return 0;
  const nx = dx / dist;
  const ny = dy / dist;
  // Push out of the rim.
  b.x = px + nx * minDist;
  b.y = py + ny * minDist;
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return 0; // already separating
  const tx = -ny;
  const ty = nx;
  const vt = b.vx * tx + b.vy * ty;
  const newVn = -vn * RESTITUTION.rim;
  const newVt = vt * FRICTION.rim;
  b.vx = newVn * nx + newVt * tx;
  b.vy = newVn * ny + newVt * ty;
  return -vn;
}

export function simulateShot(launch: Launch, court: Court = DEFAULT_COURT, cond: ShotConditions = {}): ShotSim {
  const c = court;
  const wind = cond.wind ?? 0;
  const phase = cond.phase ?? 0;
  const r = c.ballRadius;
  const rad = (launch.angle * Math.PI) / 180;
  const b: Ball = { x: 0, y: c.releaseHeight, vx: launch.speed * Math.cos(rad), vy: launch.speed * Math.sin(rad) };

  const boardLo = c.rimHeight + c.boardBottom;
  const boardHi = c.rimHeight + c.boardTop;

  const path: [number, number, number][] = [[0, b.x, b.y]];
  const events: ShotEvent[] = [];
  let touchedRim = false;
  let touchedBoard = false;
  let scoredAt: number | null = null;
  let firstDescentX: number | null = null;
  let descentHoopX = c.hoopDistance;
  let t = 0;
  let step = 0;
  let lastFloor = -1;

  while (t < MAX_TIME) {
    const prevY = b.y;
    // Moving hoop: everything attached to it shifts together.
    const hoopX = c.hoopDistance + hoopOffset(c, phase + t);
    const rimFront = hoopX - c.rimRadius;
    const rimBack = hoopX + c.rimRadius;
    const boardX = rimBack + c.boardGap;
    b.vx += wind * DT;
    b.vy -= c.gravity * DT;
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    t = ++step * DT;

    // Rim: two points in side view (front and back of the hoop).
    for (const px of [rimFront, rimBack]) {
      const impact = collidePoint(b, px, c.rimHeight, r);
      if (impact > 0.3) {
        touchedRim = true;
        events.push({ t, type: "rim", x: px, y: c.rimHeight, impact });
      }
    }

    // Backboard face (approached from the court side) and its bottom/top edges.
    if (b.x + r > boardX && b.x - r < boardX + 0.05 && b.y > boardLo && b.y < boardHi && b.vx > 0) {
      const impact = b.vx;
      b.x = boardX - r;
      b.vx = -b.vx * RESTITUTION.board;
      touchedBoard = true;
      events.push({ t, type: "board", x: boardX, y: b.y, impact });
    }
    for (const py of [boardLo, boardHi]) {
      const impact = collidePoint(b, boardX, py, r);
      if (impact > 0.3) {
        touchedBoard = true;
        events.push({ t, type: "board", x: boardX, y: py, impact });
      }
    }

    // Floor.
    if (b.y - r < 0) {
      const impact = -b.vy;
      b.y = r;
      b.vy = -b.vy * RESTITUTION.floor;
      b.vx *= FRICTION.floor;
      if (impact > 0.5 && t - lastFloor > 0.05) {
        events.push({ t, type: "floor", x: b.x, y: 0, impact });
        lastFloor = t;
      }
    }

    // Crossing rim height on the way down.
    if (prevY >= c.rimHeight && b.y < c.rimHeight && b.vy < 0) {
      if (firstDescentX === null) {
        firstDescentX = b.x;
        descentHoopX = hoopX;
      }
      if (scoredAt === null && Math.abs(b.x - hoopX) < c.rimRadius - RIM_TUBE) {
        scoredAt = t;
        events.push({ t, type: "score", x: b.x, y: c.rimHeight, impact: Math.hypot(b.vx, b.vy) });
      }
    }

    if (step % SAMPLE_EVERY === 0) path.push([round(t), round(b.x), round(b.y)]);

    const settled = b.y <= r + 1e-3 && Math.abs(b.vy) < 0.4;
    if ((scoredAt !== null && t - scoredAt > AFTER_SCORE) || b.x < -2 || b.x > c.hoopDistance + 4 || (settled && t > 0.5)) break;
  }

  const scored = scoredAt !== null;
  const error = (firstDescentX ?? b.x) - descentHoopX;
  let miss: MissKind | null = null;
  if (!scored) {
    if (touchedRim) miss = "rim";
    else if (touchedBoard) miss = "long";
    else if (firstDescentX === null || error < -c.rimRadius - r) miss = Math.abs(error) > 1 ? "airball" : "short";
    else miss = "long";
  }

  return {
    launch,
    path,
    events,
    result: { scored, swish: scored && !touchedRim && !touchedBoard, bank: scored && touchedBoard, miss, error },
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
