import { courtThemeId, type CourtThemeId } from "./courts";
import { DIFFICULTIES, type DifficultyId } from "./difficulty";
import type { GhostRun, GhostShot } from "./ghostRun";
import { clampTimedSeconds } from "./modes";

/**
 * Challenge links: a timed or daily run, sent to a friend as a link they race.
 *
 * The whole run travels in the link: the ghost stores only launches and the physics is
 * deterministic, so the friend's game flies the exact same shots beside them. Nothing is
 * stored anywhere; a link is only as public as wherever it's pasted.
 *
 * Wire format (versioned): base64url of compact JSON, numbers as scaled integers.
 */

export interface Challenge {
  /** Who sent it (their display name) */
  name: string;
  mode: "timed" | "daily";
  seconds: number;
  difficulty: DifficultyId;
  court: CourtThemeId;
  /** The daily's key ("daily20261106"): only that day's daily can be raced */
  daily: string | null;
  points: number;
  shots: GhostShot[];
}

export const CHALLENGE_PARAM = "vs";
const VERSION = 1;
export const MAX_NAME = 20;
/** About two minutes of fast shooting; longer runs send their first shots only (the race is decided by then). */
const MAX_SHOTS = 120;
/** Scale per shot field: t, speed, angle, aim, wind, phase, points. Fine enough that re-simulated rim shots fall the same way. */
const SCALE = [100, 10_000, 1000, 1000, 10_000, 1000, 1] as const;

interface Wire {
  v: number;
  n: string;
  m: "t" | "d";
  s: number;
  d: string;
  c: string;
  k?: string;
  p: number;
  x: number[][];
}

function toBase64Url(text: string) {
  let bin = "";
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string) {
  const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export const cleanName = (name: string) => name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_NAME);

export function encodeChallenge(c: Challenge): string {
  const wire: Wire = {
    v: VERSION,
    n: cleanName(c.name),
    m: c.mode === "daily" ? "d" : "t",
    s: c.seconds,
    d: c.difficulty,
    c: c.court,
    ...(c.daily ? { k: c.daily } : {}),
    p: c.points,
    x: c.shots.slice(0, MAX_SHOTS).map((s) => [s.t, s.speed, s.angle, s.aim, s.wind, s.phase, s.points].map((v, i) => Math.round(v * SCALE[i]))),
  };
  return toBase64Url(JSON.stringify(wire));
}

/** A challenge from a link, or null if it isn't one (garbled, edited, or from a newer version). */
export function decodeChallenge(code: string | null | undefined): Challenge | null {
  if (!code || code.length > 12_000) return null;
  let w: Wire;
  try {
    w = JSON.parse(fromBase64Url(code));
  } catch {
    return null;
  }
  if (!w || w.v !== VERSION || (w.m !== "t" && w.m !== "d") || typeof w.n !== "string") return null;
  if (!(typeof w.d === "string" && w.d in DIFFICULTIES) || typeof w.c !== "string") return null;
  if (!Number.isInteger(w.p) || w.p < 0 || !Number.isFinite(w.s) || clampTimedSeconds(w.s) !== w.s) return null;
  if (w.m === "d" && !(typeof w.k === "string" && /^daily\d{8}$/.test(w.k))) return null;
  if (!Array.isArray(w.x) || w.x.length > MAX_SHOTS) return null;
  const shots: GhostShot[] = [];
  for (const row of w.x) {
    if (!Array.isArray(row) || row.length !== SCALE.length || !row.every((v) => Number.isFinite(v))) return null;
    const [t, speed, angle, aim, wind, phase, points] = row.map((v, i) => v / SCALE[i]);
    if (t < 0 || t > w.s + 5 || speed <= 0 || points < 0) return null;
    shots.push({ t, speed, angle, aim, wind, phase, points });
  }
  return {
    name: cleanName(w.n),
    mode: w.m === "d" ? "daily" : "timed",
    seconds: w.s,
    difficulty: w.d as DifficultyId,
    court: courtThemeId(w.c),
    daily: w.m === "d" ? w.k! : null,
    points: w.p,
    shots,
  };
}

export const challengeRun = (c: Challenge): GhostRun => ({ points: c.points, shots: c.shots });

/** Who won a raced challenge, by how much: + = you. */
export const challengeMargin = (c: Challenge, yourPoints: number) => yourPoints - c.points;
