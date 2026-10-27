import type { Avatar } from "@/lib/game/avatar";

/**
 * REST client for the AirHoops API (airhoops-backend). Only small JSON
 * payloads go over the network: never video, never landmarks.
 */

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
export const WS_URL = (process.env.NEXT_PUBLIC_WS_URL ?? API_URL.replace(/^http/, "ws")).replace(/\/$/, "");

export interface User {
  id: string;
  nickname: string;
  avatar?: Avatar | null;
}

export type RoomPhase = "lobby" | "ready" | "in_progress" | "finished";

export interface RoomPlayer {
  id: string;
  nickname: string;
  avatar?: Avatar | null;
  ready: boolean;
  connected: boolean;
  host: boolean;
}

export interface RoomState {
  code: string;
  phase: RoomPhase;
  mode: string;
  difficulty: string;
  max_players: number;
  race_seconds: number;
  host_id: string;
  players: RoomPlayer[];
}

export type Period = "day" | "week" | "all";

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  nickname: string;
  avatar?: Avatar | null;
  best: number;
  games: number;
}

export interface PersonalBest {
  best: number;
  games: number;
  rank: number;
}

export type PersonalBests = Record<Period, PersonalBest | null>;

/** A finished solo run. `score` is points (timed) or the best streak (streak). */
export interface RunSubmission {
  mode: string;
  difficulty: string;
  score: number;
  shots: number;
  makes: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        // Only with a body: a plain GET then needs no CORS preflight (one round trip instead of two).
        ...(rest.body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch {
    throw new ApiError(0, "offline", "Can't reach the game server. Is it running?");
  }
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.detail;
    if (detail && typeof detail === "object" && "code" in detail) throw new ApiError(res.status, detail.code, detail.message);
    if (res.status === 429) throw new ApiError(429, "rate_limited", "Slow down a little and try again.");
    if (res.status === 401) throw new ApiError(401, "unauthorized", "Your guest session expired");
    if (res.status === 422) throw new ApiError(422, "invalid", "Names are 2–20 letters, numbers, spaces, . _ -");
    throw new ApiError(res.status, "error", typeof detail === "string" ? detail : "Something went wrong");
  }
  return body as T;
}

export const api = {
  createGuest: (nickname: string, avatar?: Avatar) =>
    request<{ user: User; token: string }>("/auth/guest", { method: "POST", body: JSON.stringify({ nickname, avatar }) }),
  me: (token: string) => request<User>("/auth/me", { token }),
  updateProfile: (token: string, changes: { nickname?: string; avatar?: Avatar }) =>
    request<User>("/auth/me", { method: "PATCH", token, body: JSON.stringify(changes) }),
  /** Erase this guest and their scores/throws from the server. */
  deleteMe: (token: string) => request<null>("/auth/me", { method: "DELETE", token }),
  createRoom: (token: string, mode: string, difficulty: string, raceSeconds = 60) =>
    request<RoomState>("/rooms", { method: "POST", token, body: JSON.stringify({ mode, difficulty, race_seconds: raceSeconds }) }),
  joinRoom: (token: string, code: string) => request<RoomState>(`/rooms/${encodeURIComponent(code)}/join`, { method: "POST", token }),
  getRoom: (code: string) => request<RoomState>(`/rooms/${encodeURIComponent(code)}`),
  submitScore: (token: string, run: RunSubmission) =>
    request<{ status: "saved"; best: number; rank: number }>("/scores", { method: "POST", token, body: JSON.stringify(run) }),
  leaderboard: (params: { mode: string; period: Period; difficulty?: string; limit?: number }) =>
    request<LeaderboardEntry[]>(`/leaderboard?${query(params)}`),
  myBests: (token: string, params: { mode: string; difficulty?: string }) => request<PersonalBests>(`/leaderboard/me?${query(params)}`, { token }),
};

function query(params: Record<string, string | number | undefined>) {
  return new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (v === undefined || v === "" ? [] : [[k, String(v)]]))).toString();
}

/* ── Guest session (kept on this device) ── */

const GUEST_KEY = "airhoops.guest";

export interface GuestSession {
  token: string;
  user: User;
}

export function loadGuest(): GuestSession | null {
  try {
    const g = JSON.parse(localStorage.getItem(GUEST_KEY) ?? "null");
    return g?.token && g?.user?.id ? g : null;
  } catch {
    return null;
  }
}

export function saveGuest(g: GuestSession | null) {
  try {
    if (g) localStorage.setItem(GUEST_KEY, JSON.stringify(g));
    else localStorage.removeItem(GUEST_KEY);
  } catch {}
}

/**
 * Sends this device's name/look to the server if there is a guest session,
 * so opponents see the latest version. Never throws: offline is fine.
 */
export async function pushProfile(changes: { nickname?: string; avatar?: Avatar }) {
  const g = loadGuest();
  if (!g) return null;
  try {
    const user = await api.updateProfile(g.token, changes);
    saveGuest({ ...g, user });
    return user;
  } catch {
    return null;
  }
}

/* ── Room codes ── */

export const ROOM_CODE_LENGTH = 5;

/**
 * Turns whatever was typed or pasted into a room code:
 * "abcde" → "ABCDE", an invite link (…/multiplayer?room=ABCDE) → "ABCDE",
 * "Join my room: ABCDE" → "ABCDE".
 */
export function extractRoomCode(text: string): string {
  const t = text.trim();
  const fromLink = t.match(/[?&]room=([A-Za-z0-9]+)/);
  if (fromLink) return fromLink[1].toUpperCase().slice(0, ROOM_CODE_LENGTH);
  const cleaned = t.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length <= ROOM_CODE_LENGTH) return cleaned;
  // Longer text: pick out a standalone 5-character word, e.g. from a chat message.
  const word = t
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .reverse()
    .find((w) => w.length === ROOM_CODE_LENGTH);
  return word ?? cleaned.slice(0, ROOM_CODE_LENGTH);
}
