import type { MissKind, ShotResult } from "./physics";

/**
 * The run's coach: reads every shot of a run and says what to work on.
 *
 * Each shot is judged the way the post-shot gauge judges it (coachShot in shot.ts):
 * power against the make zone with the direction put right, and direction against
 * where the rim was. A run's worth of those shows a habit a single shot can't: misses
 * that keep falling short, a drift to one side, or power all over the place. The tip
 * names the habit and the body move that fixes it.
 */

export interface CoachShot {
  /** 0..1 */
  power: number;
  /** Launch aim, degrees (+ = right) */
  aim: number;
  /** Aim that would have centred the shot, and how far either side still goes in */
  aimTarget: number;
  aimTolerance: number;
  /** Power that scores with the direction put right (null: no power reaches at this arc) */
  window: { lo: number; hi: number } | null;
  input: "camera" | "keys";
  result: ShotResult;
  /** Camera throws: how hard they jumped into it (0..1) */
  jump?: number;
}

export type TipId = "short" | "long" | "left" | "right" | "spread" | "arc" | "rim" | "locked";

export interface Tip {
  id: TipId;
  /** What happened, with the numbers ("4 of 6 misses fell short") */
  title: string;
  /** What to do about it */
  body: string;
}

export interface Mark {
  /** Where the ball came down through rim height, from the rim's centre (m): + = right */
  x: number;
  /** + = long (past the rim) */
  y: number;
  made: boolean;
  swish: boolean;
}

export interface CoachReport {
  shots: number;
  makes: number;
  misses: Partial<Record<MissKind, number>>;
  marks: Mark[];
  /** Average power minus the middle of the make zone (+ = too hard); null without a zone to judge by */
  powerBias: number | null;
  /** Average aim minus where it should have been, degrees (+ = right) */
  aimBias: number | null;
  /** Best first, at most two */
  tips: Tip[];
}

/** Fewer shots than this and a pattern is just noise. */
export const MIN_SHOTS = 3;
/** Power off the middle of the zone, on average, before it's a habit */
const POWER_BIAS = 0.04;
/** Shot-to-shot power spread (standard deviation) that's too loose to groove */
const POWER_SPREAD = 0.07;
const LOCKED_IN = 0.7;

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v: number[]) => {
  const m = mean(v);
  return Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function coachRun(shots: CoachShot[]): CoachReport {
  const makes = shots.filter((s) => s.result.scored).length;
  const misses: CoachReport["misses"] = {};
  for (const s of shots) if (s.result.miss) misses[s.result.miss] = (misses[s.result.miss] ?? 0) + 1;
  const marks = shots.map((s) => ({ x: s.result.lateral, y: s.result.error, made: s.result.scored, swish: s.result.swish }));

  const zoned = shots.filter((s) => s.window);
  const deltas = zoned.map((s) => s.power - (s.window!.lo + s.window!.hi) / 2);
  const powerBias = deltas.length ? mean(deltas) : null;
  const offs = shots.map((s) => s.aim - s.aimTarget);
  const aimBias = offs.length ? mean(offs) : null;

  const report: CoachReport = { shots: shots.length, makes, misses, marks, powerBias, aimBias, tips: [] };
  if (shots.length < MIN_SHOTS) return report;

  // The way most shots were thrown sets how the tips talk (body moves or keys).
  const camera = shots.filter((s) => s.input === "camera").length * 2 >= shots.length;
  const missed = shots.length - makes;
  const candidates: (Tip & { weight: number })[] = [];

  // Distance: misses on one side of the make zone, and how far off on average
  if (powerBias !== null && Math.abs(powerBias) >= POWER_BIAS) {
    const short = powerBias < 0;
    const n = zoned.filter((s) => (short ? s.power < s.window!.lo : s.power > s.window!.hi)).length;
    if (n >= 2) {
      const jumps = shots.filter((s) => s.jump !== undefined).map((s) => s.jump!);
      const lowJump = jumps.length > 0 && mean(jumps) < 0.25;
      candidates.push({
        id: short ? "short" : "long",
        weight: (Math.abs(powerBias) / POWER_BIAS) * (n / shots.length) * 2,
        title: `${plural(n, "shot")} ${short ? "fell short" : "went long"}`,
        body: short
          ? camera
            ? `Snap your arm faster at release.${lowJump ? " A small jump into the shot adds power too." : ""}`
            : "Hold the charge a little longer before you let go."
          : camera
            ? "Ease off: a smoother, slower push carries far enough."
            : "Let go of the charge a little sooner.",
      });
    }
  }

  // Direction: a drift to one side, past what still goes in
  const tolerance = mean(shots.map((s) => s.aimTolerance));
  if (aimBias !== null && Math.abs(aimBias) > tolerance) {
    const right = aimBias > 0;
    const n = offs.filter((o) => (right ? o > tolerance : o < -tolerance)).length;
    if (n >= 2) {
      const fix = right ? "left" : "right";
      candidates.push({
        id: right ? "right" : "left",
        weight: (Math.abs(aimBias) / tolerance) * (n / shots.length) * 1.5,
        title: `${plural(n, "shot")} drifted ${right ? "right" : "left"}`,
        body: camera
          ? `Lean a touch ${fix} as you release: your shoulders steer the ball.`
          : `Aim about ${Math.max(1, Math.round(Math.abs(aimBias)))}° further ${fix} (${fix === "left" ? "←" : "→"}).`,
      });
    }
  }

  // No arc: the hands came out too low for any power to reach
  const flat = shots.length - zoned.length;
  if (flat >= 2 && flat / shots.length >= 0.3) {
    candidates.push({
      id: "arc",
      weight: (flat / shots.length) * 4,
      title: `${plural(flat, "shot")} had too little arc to reach`,
      body: camera ? "Finish with your hands up above your head, not out in front." : "Raise the arc (↑) a few degrees.",
    });
  }

  // Power that varies a lot without leaning either way: the throw isn't grooved yet
  if (deltas.length >= MIN_SHOTS && sd(deltas) >= POWER_SPREAD && (powerBias === null || Math.abs(powerBias) < POWER_BIAS)) {
    candidates.push({
      id: "spread",
      weight: sd(deltas) / POWER_SPREAD,
      title: "Your power changed a lot from shot to shot",
      body: camera ? "Same set, same snap: pick one throw and repeat it." : "Count the same beat on every charge.",
    });
  }

  // Close: mostly rattling out, and no habit above to blame it on (a drift rattles out too)
  const rim = misses.rim ?? 0;
  if (candidates.length === 0 && rim >= 2 && rim * 2 >= missed) {
    candidates.push({
      id: "rim",
      weight: 0.9,
      title: `${plural(rim, "rim-out")}: you're close`,
      body: "Aim for the middle of the green zone, not its edge, and they'll drop.",
    });
  }

  candidates.sort((a, b) => b.weight - a.weight);
  const tips = candidates.slice(0, 2).map(({ id, title, body }) => ({ id, title, body }));
  if (makes / shots.length >= LOCKED_IN && !candidates.some((c) => c.weight > 1)) {
    tips.unshift({ id: "locked", title: `${Math.round((makes / shots.length) * 100)}% from the floor`, body: "You're locked in. Try a harder difficulty." });
    tips.length = Math.min(tips.length, 2);
  }
  report.tips = tips;
  return report;
}
