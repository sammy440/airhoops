import { WS_URL, type RoomState } from "./api";

/**
 * WebSocket client for a room.
 *
 * - Heartbeat: pings every 10 s (server drops sockets silent for 25 s) and
 *   measures round-trip time from the pong.
 * - Reconnects with exponential backoff + jitter, so a Wi-Fi blip or reload
 *   rejoins the same seat (the server holds it for 30 s).
 * - Stops for good on "fatal" closes: bad token, unknown room, replaced by
 *   another tab, or the player left.
 */

export type SocketStatus = "connecting" | "open" | "reconnecting" | "closed";

export type PresenceEvent = "joined" | "left" | "disconnected" | "reconnected";

export type MatchMode = "shootout" | "race";

export interface PlayerScore {
  points: number;
  makes: number;
  shots: number;
  swishes: number;
  streak: number;
  wind: number;
  forfeited: boolean;
}

/** Authoritative shot from the server ("shot_result"). */
export interface ServerShot {
  type: "shot_result";
  playerId: string;
  shotId?: number;
  timeout?: boolean;
  scored: boolean;
  swish?: boolean;
  bank?: boolean;
  miss?: "short" | "long" | "rim" | "airball" | null;
  error?: number;
  points: number;
  multiplier?: number;
  streak?: number;
  launch?: { speed: number; angle: number };
  wind?: number;
  phase?: number;
  releaseAt?: number;
  duration?: number;
  path?: [number, number, number][];
  events?: { t: number; type: "rim" | "board" | "floor" | "score"; x: number; y: number; impact: number }[];
  serverTime: number;
}

export interface MatchEnd {
  type: "match_end";
  winner: string | null;
  winners: string[];
  standings: ({ playerId: string; rank: number } & PlayerScore)[];
  reason: "complete" | "time" | "forfeit" | "aborted";
  serverTime: number;
}

export type ServerMessage =
  | { type: "room_state"; room: RoomState; you: string }
  | { type: "presence"; event: PresenceEvent; player: { id: string; nickname: string } }
  | { type: "pong"; t: number | null; serverTime: number }
  | { type: "error"; code: string; message: string }
  | {
      type: "match_start";
      mode: MatchMode;
      difficulty: string;
      order: string[];
      startAt: number;
      endsAt: number | null;
      raceSeconds: number | null;
      shootoutShots: number | null;
      serverTime: number;
    }
  | {
      type: "turn";
      playerId: string;
      shotsLeft: number | null;
      round: number;
      suddenDeath: boolean;
      availableAt: number;
      deadline: number;
      serverTime: number;
    }
  | ServerShot
  | { type: "scoreboard"; scores: Record<string, PlayerScore>; serverTime: number }
  | { type: "forfeit"; playerId: string; serverTime: number }
  | MatchEnd;

export type ClientMessage =
  | { type: "ready"; ready: boolean }
  | { type: "start" }
  | { type: "end" }
  | { type: "rematch" }
  /** Host, between matches: change the game (un-readies everyone, resets the series). */
  | { type: "settings"; mode?: MatchMode; difficulty?: string; raceSeconds?: number; bestOf?: 1 | 3 | 5 }
  | { type: "leave" }
  /** Only these numbers ever leave the device for a shot (never video). */
  | { type: "throw"; power: number; angle: number; arc: number; t: number };

export interface RoomSocketHandlers {
  onMessage: (msg: ServerMessage) => void;
  onStatus: (status: SocketStatus, detail?: { code?: number; reason?: string; retryInMs?: number }) => void;
  onRtt?: (ms: number) => void;
}

const HEARTBEAT_MS = 10_000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 8_000;
/** Close codes after which reconnecting is pointless. */
export const FATAL_CLOSE: Record<number, string> = {
  1000: "You left the room",
  4001: "Opened in another tab",
  4401: "Your guest session is invalid",
  4404: "That room no longer exists",
  4409: "That room is full or already playing",
};

export class RoomSocket {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  /** serverTime − local time (s), from the lowest-latency pong seen so far. */
  private offset: number | null = null;
  private bestRtt = Infinity;

  constructor(
    private readonly code: string,
    private readonly token: string,
    private readonly handlers: RoomSocketHandlers,
  ) {}

  connect() {
    this.stopped = false;
    this.open();
  }

  /** Server clock (s) estimated locally; null until the first pong. */
  serverNow(): number | null {
    return this.offset === null ? null : performance.now() / 1000 + this.offset;
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Leave the room for good (frees the seat immediately). */
  leave() {
    this.send({ type: "leave" });
    this.close();
  }

  /** Stop without leaving (e.g. navigating away): the seat is held for the grace period. */
  close() {
    this.stopped = true;
    this.clearTimers();
    this.ws?.close(1000);
    this.ws = null;
    this.handlers.onStatus("closed");
  }

  private open() {
    this.handlers.onStatus(this.attempts ? "reconnecting" : "connecting");
    const ws = new WebSocket(`${WS_URL}/ws/${encodeURIComponent(this.code)}?token=${encodeURIComponent(this.token)}`);
    this.ws = ws;

    ws.onopen = () => {
      this.attempts = 0;
      this.handlers.onStatus("open");
      // A few quick pings sharpen the clock-sync estimate, then the steady heartbeat.
      this.ping();
      setTimeout(() => this.ping(), 300);
      setTimeout(() => this.ping(), 700);
      this.heartbeat = setInterval(() => this.ping(), HEARTBEAT_MS);
    };
    ws.onmessage = (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      // Rough one-way estimate until the first pong refines it.
      if (this.offset === null && "serverTime" in msg && typeof msg.serverTime === "number") {
        this.offset = msg.serverTime - performance.now() / 1000;
      }
      if (msg.type === "pong" && typeof msg.t === "number") {
        const now = performance.now();
        const rtt = now - msg.t;
        this.handlers.onRtt?.(rtt);
        // Cristian's algorithm: assume the reply took half the round trip.
        if (rtt <= this.bestRtt * 1.2 && typeof msg.serverTime === "number") {
          this.bestRtt = Math.min(this.bestRtt, rtt);
          this.offset = msg.serverTime - (now - rtt / 2) / 1000;
        }
      }
      this.handlers.onMessage(msg);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return; // an older socket we already replaced
      this.clearTimers();
      this.ws = null;
      if (this.stopped) return;
      if (FATAL_CLOSE[e.code]) {
        this.stopped = true;
        this.handlers.onStatus("closed", { code: e.code, reason: FATAL_CLOSE[e.code] });
        return;
      }
      const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** this.attempts) * (0.75 + Math.random() * 0.5);
      this.attempts++;
      this.handlers.onStatus("reconnecting", { code: e.code, retryInMs: Math.round(delay) });
      this.retry = setTimeout(() => this.open(), delay);
    };
  }

  private ping() {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "ping", t: performance.now() }));
  }

  private clearTimers() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.retry) clearTimeout(this.retry);
    this.heartbeat = null;
    this.retry = null;
  }
}
