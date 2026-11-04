"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Reaction } from "@/hooks/useRoom";
import { REACTIONS, type ClientMessage, type ReactionId } from "@/lib/net/socket";

/** The server's limit (4 per 3 s), mirrored so the buttons dim instead of sending what it would drop. */
const BURST = 4;
const WINDOW_MS = 3000;
const EMOJI = Object.fromEntries(REACTIONS.map((r) => [r.id, r.emoji])) as Record<ReactionId, string>;

/**
 * Six quick reactions everyone in the room sees. `keys`: 1–6 send them too
 * (in a match, where nothing else uses the number keys).
 */
export function ReactionBar({ send, keys = false, className = "" }: { send: (m: ClientMessage) => void; keys?: boolean; className?: string }) {
  const sent = useRef<number[]>([]);
  const [spent, setSpent] = useState(false);
  const react = useCallback(
    (reaction: ReactionId) => {
      const now = performance.now();
      sent.current = sent.current.filter((t) => now - t < WINDOW_MS);
      if (sent.current.length >= BURST) return;
      sent.current.push(now);
      send({ type: "react", reaction });
      if (sent.current.length >= BURST) {
        setSpent(true);
        window.setTimeout(() => setSpent(false), WINDOW_MS - (now - sent.current[0]));
      }
    },
    [send],
  );
  useEffect(() => {
    if (!keys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < REACTIONS.length) react(REACTIONS[i].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys, react]);

  return (
    <div className={`glass flex gap-0.5 rounded-full p-1 ${className}`} role="group" aria-label="Send a reaction">
      {REACTIONS.map((r, i) => (
        <button
          key={r.id}
          type="button"
          onClick={(e) => {
            react(r.id);
            e.currentTarget.blur(); // so Space goes back to shooting, not to this button
          }}
          disabled={spent}
          title={keys ? `${r.label} (${i + 1})` : r.label}
          aria-label={r.label}
          className="grid size-9 place-items-center rounded-full text-xl transition hover:scale-110 hover:bg-white/10 active:scale-95 disabled:opacity-35 disabled:hover:scale-100"
        >
          {r.emoji}
        </button>
      ))}
    </div>
  );
}

/** Reactions floating up the screen, each with who sent it. Spread across the width so a flurry stays readable. */
export function ReactionBursts({
  reactions,
  names,
  you,
  className = "absolute inset-0 z-[36]",
}: {
  reactions: Reaction[];
  names: Record<string, string>;
  you: string | null;
  className?: string;
}) {
  return (
    <div className={`pointer-events-none overflow-hidden ${className}`} aria-live="polite">
      {reactions.map((r) => {
        // Golden-ratio steps: neighbours land far apart, deterministic per reaction
        const x = 12 + ((r.key * 0.618) % 1) * 70;
        return (
          <div key={r.key} className="animate-float-up absolute bottom-24 flex flex-col items-center" style={{ left: `${x}%` }}>
            <span className="text-5xl drop-shadow-[0_4px_12px_rgba(0,0,0,.5)] sm:text-6xl">{EMOJI[r.reaction] ?? "🏀"}</span>
            <span className="glass mt-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-cream">
              {r.playerId === you ? "You" : (names[r.playerId] ?? "Player")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
