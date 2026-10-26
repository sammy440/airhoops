/**
 * REST client for the AirHoops API (airhoops-backend). Only small JSON
 * payloads go over the network: never video, never landmarks.
 */

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
export const WS_URL = (process.env.NEXT_PUBLIC_WS_URL ?? API_URL.replace(/^http/, "ws")).replace(/\/$/, "");

export interface User {
  id: string;
  nickname: string;
}

export type RoomPhase = "lobby" | "ready" | "in_progress" | "finished";

export interface RoomPlayer {
  id: string;
  nickname: string;
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
  host_id: string;
  players: RoomPlayer[];
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
        "content-type": "application/json",
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
    if (res.status === 401) throw new ApiError(401, "unauthorized", "Your guest session expired");
    if (res.status === 422) throw new ApiError(422, "invalid", "Nicknames are 2–20 letters, numbers, spaces, . _ -");
    throw new ApiError(res.status, "error", typeof detail === "string" ? detail : "Something went wrong");
  }
  return body as T;
}

export const api = {
  createGuest: (nickname: string) =>
    request<{ user: User; token: string }>("/auth/guest", { method: "POST", body: JSON.stringify({ nickname }) }),
  me: (token: string) => request<User>("/auth/me", { token }),
  rename: (token: string, nickname: string) => request<User>("/auth/me", { method: "PATCH", token, body: JSON.stringify({ nickname }) }),
  createRoom: (token: string, mode: string, difficulty: string) =>
    request<RoomState>("/rooms", { method: "POST", token, body: JSON.stringify({ mode, difficulty }) }),
  joinRoom: (token: string, code: string) => request<RoomState>(`/rooms/${encodeURIComponent(code)}/join`, { method: "POST", token }),
  getRoom: (code: string) => request<RoomState>(`/rooms/${encodeURIComponent(code)}`),
};

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
