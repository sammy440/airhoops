import { samplePath, type Vec3 } from "./engine";
import { simulateShot, type Court, type ShotSim } from "./physics";

/**
 * Ghost of your best run: the shots of your best timed / daily run, kept on this device and
 * flown again beside you as a see-through ball, so you race yourself. Only the launches are
 * stored; the physics is deterministic, so re-simulating them gives the exact same flights.
 */

export interface GhostShot {
  /** Run time (s since "GO!") when the ball left the hands */
  t: number;
  speed: number;
  angle: number;
  aim: number;
  wind: number;
  /** Hoop-motion phase at launch */
  phase: number;
  points: number;
}

export interface GhostRun {
  points: number;
  shots: GhostShot[];
}

const GHOSTS_KEY = "airhoops.ghosts";
/** A long timed run is ~100 shots; anything beyond is not a real run. */
const MAX_SHOTS = 600;

type Ghosts = Partial<Record<string, GhostRun>>;

function loadAll(): Ghosts {
  try {
    return JSON.parse(localStorage.getItem(GHOSTS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function loadGhost(key: string): GhostRun | null {
  const g = loadAll()[key];
  return g && Array.isArray(g.shots) && g.shots.length ? g : null;
}

/** Saves the ghost for a best key. Old daily ghosts are dropped: only today's challenge can be raced. */
export function saveGhost(key: string, run: GhostRun) {
  if (!run.shots.length || run.shots.length > MAX_SHOTS) return;
  const all = loadAll();
  for (const k of Object.keys(all)) if (k.startsWith("daily") && k !== key) delete all[k];
  all[key] = run;
  try {
    localStorage.setItem(GHOSTS_KEY, JSON.stringify(all));
  } catch {}
}

/** Flies a ghost run: where its ball is, and how many points it had, at any run time. */
export class GhostPlayer {
  private sims: { shot: GhostShot; sim: ShotSim; scoredAt: number }[];

  constructor(run: GhostRun, court: Court) {
    this.sims = run.shots.map((shot) => {
      const sim = simulateShot({ speed: shot.speed, angle: shot.angle, aim: shot.aim }, court, { wind: shot.wind, phase: shot.phase });
      const score = sim.events.find((e) => e.type === "score");
      return { shot, sim, scoredAt: shot.t + (score ? score.t : sim.duration) };
    });
  }

  /** The ghost ball at run time `t` (s), or null between its shots. */
  ballAt(t: number): Vec3 | null {
    for (let i = this.sims.length - 1; i >= 0; i--) {
      const { shot, sim } = this.sims[i];
      if (shot.t > t) continue;
      return t - shot.t <= sim.duration ? samplePath(sim.path, t - shot.t) : null;
    }
    return null;
  }

  /** The ghost's score at run time `t`: a shot's points count once its ball drops through. */
  pointsAt(t: number): number {
    let p = 0;
    for (const s of this.sims) if (s.scoredAt <= t) p += s.shot.points;
    return p;
  }
}
