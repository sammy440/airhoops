"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { awardFromServer } from "@/lib/game/progress";
import type { RoomState } from "@/lib/net/api";
import { QUICK_CHAT, RoomSocket, SHOT_KIND_NAMES, type ClientMessage, type ReactionId, type MatchEnd, type PlayerScore, type ServerMessage, type ServerShot, type SocketStatus } from "@/lib/net/socket";

export type MatchStart = Extract<ServerMessage, { type: "match_start" }>;
export type Turn = Extract<ServerMessage, { type: "turn" }>;

/** Everything the match screen needs, rebuilt from server messages. */
export interface MatchState {
  start: MatchStart;
  scores: Record<string, PlayerScore>;
  turn: Turn | null;
  lastShot: ServerShot | null;
  result: MatchEnd | null;
  forfeits: string[];
  /** Your XP before and after this match, once the server has awarded it */
  xp?: { before: number; after: number };
}

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "good" | "warn";
}

const TOAST_MS = 3500;
/** A reaction someone sent, on screen until it has floated away. */
export interface Reaction {
  key: number;
  playerId: string;
  reaction: ReactionId;
}
export const REACTION_MS = 2400;

/** A chat message, as shown. Kept in this page's memory only (never saved), the newest CHAT_KEEP at most. */
export interface ChatLine {
  key: number;
  playerId: string;
  text: string;
  /** A quick-chat phrase rather than typed text */
  quick: boolean;
}
const CHAT_KEEP = 60;

/** Blips shorter than this (instant reloads, tab restores) don't toast at all. */
const BLIP_MS = 1500;

/** Live room state over WebSocket, plus presence toasts and connection health. */
export function useRoom(code: string | null, token: string | null, opts: { onShot?: (shot: ServerShot) => void } = {}) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [you, setYou] = useState<string | null>(null);
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [closedReason, setClosedReason] = useState<string | null>(null);
  const [rtt, setRtt] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  // Players you've muted in this room (in memory: gone when you leave)
  const [muted, setMuted] = useState<ReadonlySet<string>>(new Set());
  const toggleMute = useCallback((id: string) => {
    setMuted((m) => {
      const next = new Set(m);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const reactionKey = useRef(0);
  const onShotRef = useRef(opts.onShot);
  useEffect(() => {
    onShotRef.current = opts.onShot;
  }, [opts.onShot]);
  const namesRef = useRef<Record<string, string>>({});
  const youRef = useRef<string | null>(null);
  // Every nickname seen in this room; players who leave or forfeit keep their name in results.
  const [names, setNames] = useState<Record<string, string>>({});
  const socketRef = useRef<RoomSocket | null>(null);
  const toastId = useRef(0);
  const pendingDrops = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const toast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_MS);
  }, []);

  useEffect(() => {
    if (!code || !token) return;
    const socket = new RoomSocket(code, token, {
      onStatus: (s, detail) => {
        setStatus(s);
        if (s === "closed" && detail?.reason) setClosedReason(detail.reason);
        if (s === "open") setClosedReason(null);
      },
      onRtt: (ms) => setRtt(Math.round(ms)),
      onMessage: (msg) => {
        switch (msg.type) {
          case "room_state":
            setRoom(msg.room);
            setYou(msg.you);
            youRef.current = msg.you;
            namesRef.current = { ...namesRef.current, ...Object.fromEntries(msg.room.players.map((p) => [p.id, p.nickname])) };
            setNames(namesRef.current);
            // Back in the lobby (rematch): the old match is gone.
            if (msg.room.phase === "lobby" || msg.room.phase === "ready") setMatch(null);
            break;
          case "match_start":
            setMatch((m) => ({
              start: msg,
              scores: m?.start.startAt === msg.startAt ? m.scores : {},
              turn: m?.start.startAt === msg.startAt ? m.turn : null,
              lastShot: null,
              result: null,
              forfeits: [],
            }));
            break;
          case "scoreboard":
            setMatch((m) => (m ? { ...m, scores: msg.scores } : m));
            break;
          case "turn":
            setMatch((m) => (m ? { ...m, turn: msg } : m));
            break;
          case "shot_result":
            setMatch((m) => (m ? { ...m, lastShot: msg } : m));
            onShotRef.current?.(msg);
            break;
          case "forfeit":
            setMatch((m) => (m ? { ...m, forfeits: [...m.forfeits, msg.playerId] } : m));
            toast(`${namesRef.current[msg.playerId] ?? "A player"} forfeited`, "warn");
            break;
          case "xp": {
            const xp = awardFromServer(msg.gained, msg.xp);
            setMatch((m) => (m ? { ...m, xp } : m));
            break;
          }
          case "chat": {
            const text = msg.quick ? QUICK_CHAT.find((q) => q.id === msg.quick)?.text : msg.text;
            if (!text) break;
            const key = ++reactionKey.current;
            setChat((c) => [...c.slice(-(CHAT_KEEP - 1)), { key, playerId: msg.playerId, text, quick: !!msg.quick }]);
            break;
          }
          case "reaction": {
            const key = ++reactionKey.current;
            // A busy room still keeps it readable: the newest dozen at most.
            setReactions((r) => [...r.slice(-11), { key, playerId: msg.playerId, reaction: msg.reaction }]);
            setTimeout(() => setReactions((r) => r.filter((x) => x.key !== key)), REACTION_MS);
            break;
          }
          // H-O-R-S-E calls
          case "challenge": {
            const mine = msg.playerId === youRef.current;
            const kind = SHOT_KIND_NAMES[msg.challenge];
            toast(mine ? `You set a ${kind}. Now they have to match it.` : `${namesRef.current[msg.playerId] ?? "The setter"} set a ${kind}. Match it!`, "info");
            break;
          }
          case "letter": {
            const mine = msg.playerId === youRef.current;
            const who = mine ? "You" : (namesRef.current[msg.playerId] ?? "A player");
            toast(msg.out ? `${who} spelled ${msg.word}: out!` : `${who} ${mine ? "get" : "gets"} ${msg.word[msg.word.length - 1]} (${msg.word})`, mine ? "warn" : "good");
            break;
          }
          case "match_end":
            setMatch((m) => (m ? { ...m, result: msg, turn: null } : m));
            break;
          case "presence": {
            const name = msg.player.nickname;
            const id = msg.player.id;
            const pending = pendingDrops.current.get(id);
            if (msg.event === "disconnected") {
              // Wait a moment: if they're straight back, say nothing.
              pendingDrops.current.set(
                id,
                setTimeout(() => {
                  pendingDrops.current.delete(id);
                  toast(`${name} lost connection…`, "warn");
                }, BLIP_MS),
              );
              break;
            }
            if (msg.event === "reconnected" && pending) {
              clearTimeout(pending);
              pendingDrops.current.delete(id);
              break;
            }
            const copy = {
              joined: [`${name} joined`, "good"],
              left: [`${name} left`, "warn"],
              disconnected: [`${name} lost connection…`, "warn"],
              reconnected: [`${name} is back`, "good"],
            } as const;
            const [text, tone] = copy[msg.event];
            toast(text, tone);
            break;
          }
          case "error":
            setError(msg.message);
            setTimeout(() => setError(null), TOAST_MS);
            break;
        }
      },
    });
    socketRef.current = socket;
    socket.connect();
    const drops = pendingDrops.current;
    return () => {
      socket.close();
      socketRef.current = null;
      drops.forEach(clearTimeout);
      drops.clear();
      // Leaving the room: its chat and mutes go with it (nothing about chat is kept anywhere)
      setChat([]);
      setMuted(new Set());
    };
  }, [code, token, toast]);

  const send = useCallback((msg: ClientMessage) => socketRef.current?.send(msg), []);
  const serverNow = useCallback(() => socketRef.current?.serverNow() ?? null, []);
  const leave = useCallback(() => socketRef.current?.leave(), []);

  return { room, you, status, closedReason, rtt, toasts, error, send, leave, match, serverNow, toast, names, reactions, chat, muted, toggleMute };
}
