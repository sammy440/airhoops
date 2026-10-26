/**
 * The player's look: body, skin, hair and kit. Stored on this device and,
 * for multiplayer guests, on the server so opponents see it too.
 */

export type Gender = "male" | "female";
export type HairStyle = "short" | "afro" | "braids" | "ponytail" | "bun" | "bald";

export interface Avatar {
  version: 1;
  gender: Gender;
  skin: string;
  hair: HairStyle;
  hairColor: string;
  jersey: string;
  shorts: string;
  shoes: string;
  number: number;
}

export const SKIN_TONES = [
  { name: "Porcelain", hex: "#f3d2b8" },
  { name: "Ivory", hex: "#e9b993" },
  { name: "Honey", hex: "#d39b6d" },
  { name: "Caramel", hex: "#b07446" },
  { name: "Bronze", hex: "#8a5530" },
  { name: "Chestnut", hex: "#6b3e22" },
  { name: "Espresso", hex: "#4a2a17" },
  { name: "Ebony", hex: "#33200f" },
] as const;

export const KIT_COLORS = [
  { name: "Flame", hex: "#ea3a1d" },
  { name: "Royal", hex: "#1f4fd1" },
  { name: "Forest", hex: "#13804f" },
  { name: "Gold", hex: "#f2b705" },
  { name: "Purple", hex: "#6b2fb3" },
  { name: "Sky", hex: "#3aa8e8" },
  { name: "Teal", hex: "#0f8c8c" },
  { name: "Pink", hex: "#e84d8a" },
  { name: "Black", hex: "#17110d" },
  { name: "White", hex: "#f4f1ea" },
] as const;

export const HAIR_COLORS = [
  { name: "Black", hex: "#1a120c" },
  { name: "Brown", hex: "#4a2e1a" },
  { name: "Auburn", hex: "#7a3417" },
  { name: "Blonde", hex: "#d9b26b" },
  { name: "Grey", hex: "#a7a29a" },
] as const;

export const HAIR_STYLES: { id: HairStyle; name: string }[] = [
  { id: "short", name: "Short" },
  { id: "afro", name: "Afro" },
  { id: "braids", name: "Braids" },
  { id: "ponytail", name: "Ponytail" },
  { id: "bun", name: "Bun" },
  { id: "bald", name: "Bald" },
];

export const DEFAULT_AVATAR: Avatar = {
  version: 1,
  gender: "male",
  skin: "#8a5530",
  hair: "short",
  hairColor: "#1a120c",
  jersey: "#ea3a1d",
  shorts: "#17110d",
  shoes: "#f4f1ea",
  number: 23,
};

const HEX = /^#[0-9a-f]{6}$/i;
const GENDERS: Gender[] = ["male", "female"];

/** Accepts anything (localStorage, server, other players) and returns a valid avatar. */
export function sanitizeAvatar(x: unknown): Avatar {
  const a = (x && typeof x === "object" ? x : {}) as Partial<Avatar>;
  const color = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : fallback);
  const n = Number(a.number);
  return {
    version: 1,
    gender: GENDERS.includes(a.gender as Gender) ? (a.gender as Gender) : DEFAULT_AVATAR.gender,
    skin: color(a.skin, DEFAULT_AVATAR.skin),
    hair: HAIR_STYLES.some((h) => h.id === a.hair) ? (a.hair as HairStyle) : DEFAULT_AVATAR.hair,
    hairColor: color(a.hairColor, DEFAULT_AVATAR.hairColor),
    jersey: color(a.jersey, DEFAULT_AVATAR.jersey),
    shorts: color(a.shorts, DEFAULT_AVATAR.shorts),
    shoes: color(a.shoes, DEFAULT_AVATAR.shoes),
    number: Number.isInteger(n) && n >= 0 && n <= 99 ? n : DEFAULT_AVATAR.number,
  };
}

export function randomAvatar(random: () => number = Math.random): Avatar {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)];
  const gender = pick(GENDERS);
  const jersey = pick(KIT_COLORS).hex;
  let shorts = pick(KIT_COLORS).hex;
  if (shorts === jersey) shorts = "#17110d";
  return {
    version: 1,
    gender,
    skin: pick(SKIN_TONES).hex,
    hair: pick(HAIR_STYLES).id,
    hairColor: pick(HAIR_COLORS).hex,
    jersey,
    shorts,
    shoes: pick(["#f4f1ea", "#17110d", jersey]),
    number: Math.floor(random() * 100),
  };
}

/* ── Colour helpers ── */

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Lighten (amount > 0) or darken (amount < 0) a hex colour; amount in -1..1. */
export function shade(hex: string, amount: number) {
  const [r, g, b] = rgb(hex);
  const f = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  return `#${[f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Cream or ink, whichever reads better on `hex` (for the jersey number). */
export function contrastOn(hex: string) {
  const [r, g, b] = rgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#17110d" : "#f7f1d6";
}

/* ── Profile storage (this device) ── */

const PROFILE_KEY = "airhoops.profile";

export interface Profile {
  name: string;
  avatar: Avatar;
}

export function loadProfile(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null");
    return { name: typeof p?.name === "string" ? p.name : "", avatar: sanitizeAvatar(p?.avatar) };
  } catch {
    return { name: "", avatar: DEFAULT_AVATAR };
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: p.name, avatar: sanitizeAvatar(p.avatar) }));
  } catch {}
}

/** Same rules as the server: 2–20 letters, numbers, spaces, . _ - */
export function validName(name: string) {
  return /^[\p{L}\p{N} ._-]{2,20}$/u.test(name.trim());
}
