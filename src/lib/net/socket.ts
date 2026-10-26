import { WS_URL, type RoomState } from "./api";

/**
 * WebSocket client for a room (README §7.2 protocol).
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

export type ServerMessage =
  | { type: "room_state"; room: RoomState; you: string }
  | { type: "presence"; event: PresenceEvent; player: { id: string; nickname: string } }
  | { type: "pong"; t: number | null }
  | { type: "error"; code: string; message: string };

export type ClientMessage =
  | { type: "ready"; ready: boolean }
  | { type: "start" }
  | { type: "end" }
  | { type: "rematch" }
  | { type: "leave" };

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

  constructor(
    private readonly code: string,
    private readonly token: string,
    private readonly handlers: RoomSocketHandlers,
  ) {}

  connect() {
    this.stopped = false;
    this.open();
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
      this.ping();
      this.heartbeat = setInterval(() => this.ping(), HEARTBEAT_MS);
    };
    ws.onmessage = (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === "pong" && typeof msg.t === "number") this.handlers.onRtt?.(performance.now() - msg.t);
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
