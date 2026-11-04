/**
 * Unlockables: ball skins and flight-trail colours, earned by level (xp.ts). Purely cosmetic,
 * and only on your own screen. Every court and avatar option stays free.
 */

export interface BallSkin {
  id: string;
  name: string;
  level: number;
  /** Top, middle and bottom of the ball's shading, and the seam colour */
  light: string;
  base: string;
  dark: string;
  seam: string;
}

export const BALL_SKINS: BallSkin[] = [
  { id: "classic", name: "Classic", level: 1, light: "#f39a52", base: "#f07b2c", dark: "#c4561c", seam: "rgba(30,12,4,0.85)" },
  { id: "retro", name: "Retro", level: 3, light: "#ff5a4f", base: "#efe9da", dark: "#2a55c8", seam: "rgba(20,24,60,0.8)" },
  { id: "gold", name: "Gold", level: 6, light: "#ffe7a0", base: "#e0aa3e", dark: "#8a5a12", seam: "rgba(60,35,0,0.8)" },
  { id: "ice", name: "Ice", level: 10, light: "#ffffff", base: "#a9dcff", dark: "#3c7fc4", seam: "rgba(10,40,80,0.7)" },
  { id: "lava", name: "Lava", level: 15, light: "#5a2416", base: "#2a120c", dark: "#120806", seam: "rgba(255,130,40,0.95)" },
  { id: "galaxy", name: "Galaxy", level: 22, light: "#c08cff", base: "#3b1f7a", dark: "#0d0624", seam: "rgba(255,255,255,0.65)" },
];

export interface TrailSkin {
  id: string;
  name: string;
  level: number;
  /** In flight: the faint trail's colour */
  calm: string;
  /** On fire: colour at the ball (head) and at the end of the trail (tail), RGB 0..1. Rainbow cycles hues instead. */
  head: [number, number, number];
  tail: [number, number, number];
  rainbow?: boolean;
}

export const TRAILS: TrailSkin[] = [
  { id: "flame", name: "Flame", level: 1, calm: "#f6a13a", head: [1, 0.85, 0.2], tail: [1, 0.35, 0.05] },
  { id: "blue", name: "Blue flame", level: 4, calm: "#6ec3ff", head: [0.75, 0.95, 1], tail: [0.1, 0.35, 1] },
  { id: "toxic", name: "Toxic", level: 8, calm: "#8ef05a", head: [0.9, 1, 0.35], tail: [0.1, 0.75, 0.2] },
  { id: "royal", name: "Royal", level: 12, calm: "#c08cff", head: [1, 0.75, 1], tail: [0.5, 0.15, 0.9] },
  { id: "rainbow", name: "Rainbow", level: 18, calm: "#ffffff", head: [1, 1, 1], tail: [1, 1, 1], rainbow: true },
];

export interface Loadout {
  ball: string;
  trail: string;
}

export const DEFAULT_LOADOUT: Loadout = { ball: "classic", trail: "flame" };

export const ballSkin = (id: string) => BALL_SKINS.find((s) => s.id === id) ?? BALL_SKINS[0];
export const trailSkin = (id: string) => TRAILS.find((s) => s.id === id) ?? TRAILS[0];

/** The loadout you can actually use at `level` (anything still locked falls back to the default). */
export function usableLoadout(l: Loadout, level: number): Loadout {
  const ball = ballSkin(l.ball);
  const trail = trailSkin(l.trail);
  return { ball: ball.level <= level ? ball.id : DEFAULT_LOADOUT.ball, trail: trail.level <= level ? trail.id : DEFAULT_LOADOUT.trail };
}

/** What reaching `level` (from `from`) unlocks, e.g. for a level-up toast. */
export function unlockedBetween(from: number, to: number): string[] {
  return [
    ...BALL_SKINS.filter((s) => s.level > from && s.level <= to).map((s) => `${s.name} ball`),
    ...TRAILS.filter((s) => s.level > from && s.level <= to).map((s) => `${s.name} trail`),
  ];
}

/** Trail colour at position f (0 = tail, 1 = at the ball), RGB 0..1. */
export function trailColor(t: TrailSkin, f: number, i: number): [number, number, number] {
  if (t.rainbow) return hslToRgb((i * 0.07) % 1, 1, 0.55 + f * 0.15);
  return [0, 1, 2].map((k) => t.tail[k] + (t.head[k] - t.tail[k]) * f) as [number, number, number];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
