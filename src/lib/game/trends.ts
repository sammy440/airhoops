import type { ShootingStats, ShotTotals } from "@/lib/net/api";
import type { MissKind } from "./physics";

/**
 * Shooting trends for the profile: what weeks of play say that one run can't.
 *
 * The run coach (coach.ts) judges each shot against its make zone. Here we only have totals per
 * day (`GET /me/stats`), so the habits are read from how misses add up: most of them falling
 * short, a lean to one side, and, for refereed multiplayer throws, where they actually came down.
 */

/** Fewer than this many misses (or shots per week) and a pattern is noise. */
export const MIN_MISSES = 8;
export const MIN_WEEK_SHOTS = 20;
/** One kind of miss is a habit once it's this share of all misses (six kinds: even would be ~17%). */
const HABIT_SHARE = 0.4;
/** Week-on-week change in make rate worth mentioning (percentage points) */
const TREND_POINTS = 3;
/** Average miss more than this far off (m) on one axis, from multiplayer throws */
const BIAS_M = 0.15;

export interface Insight {
  id: "up" | "down" | "steady" | MissKind | "bias-long" | "bias-short" | "bias-left" | "bias-right";
  tone: "good" | "work" | "neutral";
  title: string;
  body: string;
}

export const pct = (makes: number, shots: number) => (shots ? Math.round((makes / shots) * 100) : 0);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function sum(rows: (ShotTotals | null | undefined)[]): ShotTotals {
  const out: ShotTotals = { shots: 0, makes: 0, swishes: 0, banks: 0, misses: {} };
  for (const r of rows) {
    if (!r) continue;
    out.shots += r.shots;
    out.makes += r.makes;
    out.swishes += r.swishes;
    out.banks += r.banks;
    for (const [k, n] of Object.entries(r.misses) as [MissKind, number][]) out.misses[k] = (out.misses[k] ?? 0) + n;
  }
  return out;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** This week (the last 7 days, today included) and the 7 before it, solo and multiplayer together. */
export function weeks(stats: ShootingStats, today = new Date()): { thisWeek: ShotTotals; lastWeek: ShotTotals } {
  const day = (back: number) => isoDay(new Date(today.getTime() - back * 86_400_000));
  const [weekStart, lastStart] = [day(6), day(13)];
  const rows = (from: string, to: string) => stats.by_day.filter((d) => d.day >= from && d.day < to).flatMap((d) => [d.solo, d.match]);
  return { thisWeek: sum(rows(weekStart, "9999")), lastWeek: sum(rows(lastStart, weekStart)) };
}

const MISS_TIPS: Partial<Record<MissKind, { title: (n: number, of: number) => string; body: string }>> = {
  short: { title: (n, of) => `${n} of ${of} misses fell short`, body: "Snap your arm faster at release, or jump into the shot: power comes from speed, not reach." },
  long: { title: (n, of) => `${n} of ${of} misses went long`, body: "Ease off: a smoother, slower push carries far enough." },
  left: { title: (n, of) => `${n} of ${of} misses went left`, body: "Lean a touch right as you release: your shoulders steer the ball." },
  right: { title: (n, of) => `${n} of ${of} misses went right`, body: "Lean a touch left as you release: your shoulders steer the ball." },
  rim: { title: (n, of) => `${n} of ${of} misses rattled out`, body: "You're close. Aim for the middle of the green zone, not its edge." },
  airball: { title: (n, of) => `${n} of ${of} misses were airballs`, body: "Pause with the ball up (the set point) before every throw, and recalibrate if it keeps happening." },
};

/** At most three things worth saying, most useful first. */
export function insights(stats: ShootingStats, today = new Date()): Insight[] {
  const out: Insight[] = [];

  const { thisWeek, lastWeek } = weeks(stats, today);
  if (thisWeek.shots >= MIN_WEEK_SHOTS && lastWeek.shots >= MIN_WEEK_SHOTS) {
    const [now, before] = [pct(thisWeek.makes, thisWeek.shots), pct(lastWeek.makes, lastWeek.shots)];
    const delta = now - before;
    if (delta >= TREND_POINTS) out.push({ id: "up", tone: "good", title: `Up ${delta} points this week`, body: `${now}% from the floor, from ${before}% the week before. Keep it going.` });
    else if (delta <= -TREND_POINTS)
      out.push({ id: "down", tone: "work", title: `Down ${-delta} points this week`, body: `${now}% from the floor, from ${before}% the week before. A quick recalibration often helps.` });
    else out.push({ id: "steady", tone: "neutral", title: `Steady at ${now}%`, body: `Within ${TREND_POINTS} points of last week (${before}%).` });
  }

  // The commonest miss, if it's a habit
  const missed = Object.values(stats.totals.misses).reduce((a, b) => a + (b ?? 0), 0);
  if (missed >= MIN_MISSES) {
    const [kind, n] = (Object.entries(stats.totals.misses) as [MissKind, number][]).sort((a, b) => b[1] - a[1])[0];
    const tip = MISS_TIPS[kind];
    if (tip && n / missed >= HABIT_SHARE) out.push({ id: kind, tone: "work", title: tip.title(n, missed), body: tip.body });
  }

  // Where refereed misses actually land (multiplayer only): the clearer axis
  const b = stats.miss_bias;
  if (b && b.misses >= MIN_MISSES) {
    const depth = Math.abs(b.depth) >= Math.abs(b.side);
    const off = depth ? b.depth : b.side;
    if (Math.abs(off) >= BIAS_M) {
      const way = depth ? (off > 0 ? "long" : "short") : off > 0 ? "right" : "left";
      const cm = Math.round(Math.abs(off) * 100);
      const id = `bias-${way}` as Insight["id"];
      // Don't say the same thing twice
      if (!out.some((i) => i.id === way)) {
        out.push({
          id,
          tone: "work",
          title: `In matches, misses land ${cm} cm ${depth ? way : `to the ${way}`}`,
          body: `Averaged over your last ${plural(b.misses, "refereed miss", "refereed misses")}.`,
        });
      }
    }
  }

  return out.slice(0, 3);
}

/** Per-day make rate for a sparkline: [YYYY-MM-DD, %, shots], oldest first. */
export function dailyRates(stats: ShootingStats): [string, number, number][] {
  return stats.by_day.map((d) => {
    const t = sum([d.solo, d.match]);
    return [d.day, pct(t.makes, t.shots), t.shots];
  });
}
