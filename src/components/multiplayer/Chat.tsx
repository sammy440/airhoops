"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatLine } from "@/hooks/useRoom";
import { Cancel01Icon, Mail01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CHAT_MAX_CHARS, QUICK_CHAT, type ClientMessage } from "@/lib/net/socket";

/**
 * Room chat. Friends' rooms (joined with a code) type freely; quick-match rooms (strangers) get quick
 * chat only. Mute hides a player's messages. Nothing is saved, here or on the server.
 */
export function ChatPanel({
  lines,
  names,
  you,
  opponents,
  quickOnly,
  muted,
  onToggleMute,
  send,
  autoFocus = false,
  fill = false,
  onClose,
  className = "",
}: {
  lines: ChatLine[];
  names: Record<string, string>;
  you: string | null;
  /** Other players in the room (to mute) */
  opponents: { id: string; nickname: string }[];
  quickOnly: boolean;
  muted: ReadonlySet<string>;
  onToggleMute: (id: string) => void;
  send: (m: ClientMessage) => void;
  autoFocus?: boolean;
  /** Fill the height it's given (a sheet or popover), messages scrolling between header and input */
  fill?: boolean;
  /** Shows a header with a close button */
  onClose?: () => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = lines.filter((l) => !muted.has(l.playerId));
  const hidden = lines.length - shown.length;
  // The suggestions are a way to start talking: once you've said something they fold away behind a
  // "Quick replies" button (in quick match too, where they're the only way to talk, so the button matters).
  const spoke = lines.some((l) => l.playerId === you);
  const [quickOpen, setQuickOpen] = useState(false);
  const showQuick = !spoke || quickOpen;

  // Keep the newest message in view
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    send({ type: "chat", text: t.slice(0, CHAT_MAX_CHARS) });
    setText("");
    // Keep typing: on a phone, losing focus would drop the keyboard after every message
    inputRef.current?.focus({ preventScroll: true });
  };

  return (
    <section className={`flex flex-col rounded-2xl border border-cream/10 bg-white/[0.03] ${fill ? "h-full min-h-0" : ""} ${className}`} aria-label="Chat">
      {onClose && (
        <header className="flex items-center justify-between border-b border-cream/10 px-4 py-3">
          <h2 className="display text-xl">Chat</h2>
          <button type="button" onClick={onClose} aria-label="Close chat" className="grid size-8 place-items-center rounded-full text-cream/70 transition hover:bg-white/10 hover:text-cream">
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={2} />
          </button>
        </header>
      )}
      <ol
        ref={listRef}
        className={`space-y-2 overflow-y-auto overscroll-contain p-3 text-sm ${fill ? "min-h-0 flex-1" : "max-h-80 min-h-32"}`}
        aria-live="polite"
      >
        {shown.length === 0 && <li className="py-6 text-center text-xs text-cream/45">{quickOnly ? "Say hi with a quick message." : "Say hi. Messages aren't saved."}</li>}
        {shown.map((l) => (
          <li key={l.key} className={l.playerId === you ? "text-right" : ""}>
            <span className={`inline-block max-w-[85%] rounded-2xl px-3 py-1.5 text-left break-words ${l.playerId === you ? "bg-hoop/25" : "bg-white/[0.07]"}`}>
              {l.playerId !== you && <b className="mr-1.5 text-xs text-sun">{names[l.playerId] ?? "Player"}</b>}
              <span className={l.quick ? "font-semibold" : ""}>{l.text}</span>
            </span>
          </li>
        ))}
        {hidden > 0 && <li className="text-center text-[11px] text-cream/40">{hidden} message{hidden > 1 ? "s" : ""} from muted players hidden</li>}
      </ol>

      {showQuick && (
        <div className="flex flex-wrap gap-1.5 border-t border-cream/10 p-2" role="group" aria-label="Quick chat">
          {QUICK_CHAT.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={(e) => {
                send({ type: "chat", quick: q.id });
                setQuickOpen(false);
                e.currentTarget.blur(); // Space goes back to shooting
              }}
              className="rounded-full border border-cream/15 px-2.5 py-1 text-xs text-cream/85 transition hover:border-cream/40 hover:text-cream"
            >
              {q.text}
            </button>
          ))}
        </div>
      )}

      {quickOnly ? (
        <p className="border-t border-cream/10 px-3 py-2 text-[11px] text-cream/50">Quick match is quick chat only. Play with friends by room code to type.</p>
      ) : (
        <form onSubmit={submit} className="flex gap-2 border-t border-cream/10 p-2">
          <input
            ref={inputRef}
            aria-label="Message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={CHAT_MAX_CHARS}
            autoFocus={autoFocus}
            placeholder="Message…"
            enterKeyHint="send"
            autoComplete="off"
            // 16px on phones: iOS zooms the page into any smaller text field you tap
            className="min-w-0 flex-1 rounded-full border border-cream/15 bg-ink px-3.5 py-2 text-base outline-none focus:border-hoop sm:py-1.5 sm:text-sm"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            // Pressing Send mustn't take focus from the box: that's what closes a phone's keyboard
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
            className="rounded-full bg-hoop px-4 text-sm font-semibold transition hover:bg-hoop-soft disabled:opacity-40"
          >
            Send
          </button>
        </form>
      )}

      {(opponents.length > 0 || spoke) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-cream/10 px-3 py-2 text-[11px] text-cream/55">
          {spoke && (
            <button type="button" onClick={() => setQuickOpen((o) => !o)} aria-expanded={showQuick} className="font-semibold text-cream/75 hover:text-cream">
              Quick replies {showQuick ? "▾" : "▴"}
            </button>
          )}
          {opponents.map((o) => (
            <button key={o.id} type="button" onClick={() => onToggleMute(o.id)} aria-pressed={muted.has(o.id)} className="underline-offset-2 hover:text-cream hover:underline">
              {muted.has(o.id) ? `Unmute ${o.nickname}` : `Mute ${o.nickname}`}
            </button>
          ))}
          <span className="ml-auto">Not saved</span>
        </div>
      )}
    </section>
  );
}

/** True while the user is typing in a text box: game keys (Space, 1–6, arrows) must leave it alone. */
export function typingInField(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

/** Where the launcher sits: over the match (above the reactions), or in the lobby page's corner. */
const PLACEMENT = {
  match: {
    button: "right-4 bottom-24 sm:right-6",
    panel: "sm:right-6 sm:bottom-40 sm:h-[min(30rem,calc(100dvh-21.5rem))]",
  },
  lobby: {
    button: "right-4 bottom-5 sm:right-8 sm:bottom-8",
    panel: "sm:right-8 sm:bottom-24 sm:h-[min(32rem,calc(100dvh-9rem))]",
  },
};

/**
 * The chat button and its window. A mail button (with an unread count; a new message also toasts while
 * it's closed) opens a right-aligned chat window on larger screens, or a sheet from the bottom on a phone,
 * which fills the visible area above the keyboard while you type.
 */
export function ChatLauncher({
  placement,
  chat,
  names,
  you,
  opponents,
  quickOnly,
  muted,
  onToggleMute,
  send,
  toast,
}: {
  placement: keyof typeof PLACEMENT;
  chat: ChatLine[];
  names: Record<string, string>;
  you: string;
  opponents: { id: string; nickname: string }[];
  quickOnly: boolean;
  muted: ReadonlySet<string>;
  onToggleMute: (id: string) => void;
  send: (m: ClientMessage) => void;
  toast: (text: string, tone?: "info" | "good" | "warn") => void;
}) {
  const where = PLACEMENT[placement];
  const lastKey = chat.length ? chat[chat.length - 1].key : 0;
  const [open, setOpen] = useState(false);
  // Type straight away with a keyboard; on a phone, don't pop the on-screen keyboard just for opening chat
  const [finePointer] = useState(() => typeof matchMedia === "function" && matchMedia("(pointer: fine)").matches);
  const keyboard = useKeyboardFit(open);
  // What was already said counts as read when this mounts: only new messages toast or show as unread
  const [seen, setSeen] = useState(lastKey);
  const unread = open ? 0 : chat.filter((l) => l.key > seen && l.playerId !== you && !muted.has(l.playerId)).length;
  const toasted = useRef(lastKey);
  useEffect(() => {
    if (open) {
      setSeen(lastKey); // eslint-disable-line react-hooks/set-state-in-effect -- reading the panel marks it all read
      return;
    }
    for (const l of chat) {
      if (l.key <= toasted.current) continue;
      toasted.current = l.key;
      if (l.playerId !== you && !muted.has(l.playerId)) toast(`${names[l.playerId] ?? "Player"}: ${l.text}`, "info");
    }
  }, [open, lastKey, chat, you, muted, names, toast]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={unread ? `Chat, ${unread} unread` : "Chat"}
        className={`fixed z-[35] grid size-12 place-items-center rounded-full shadow-lg transition ${where.button} ${open ? "bg-cream text-ink" : "glass text-cream hover:bg-white/15"}`}
      >
        <HugeiconsIcon icon={Mail01Icon} size={22} strokeWidth={1.8} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-hoop px-1 text-[11px] font-bold text-cream">{unread}</span>
        )}
      </button>
      {open && (
        // Phone: a sheet from the bottom, full width, like a messaging app. Larger screens: a window by the button.
        <div
          className={`fixed inset-x-0 bottom-0 z-[37] h-[78dvh] overflow-hidden rounded-t-3xl bg-ink shadow-2xl sm:inset-x-auto sm:w-[26rem] sm:rounded-2xl ${where.panel}`}
          style={keyboard ?? undefined}
          role="dialog"
          aria-label="Chat"
        >
          <ChatPanel
            fill
            onClose={() => setOpen(false)}
            className="rounded-[inherit] border-cream/15"
            lines={chat}
            names={names}
            you={you}
            opponents={opponents}
            quickOnly={quickOnly}
            muted={muted}
            onToggleMute={onToggleMute}
            send={send}
            autoFocus={!quickOnly && finePointer}
          />
        </div>
      )}
    </>
  );
}

/**
 * Phones: while the on-screen keyboard is up, the chat fills exactly what's visible above it, like a
 * messaging app. The keyboard doesn't resize the page (it overlays it, and iOS scrolls the visible area
 * instead), so this follows the visual viewport: its height, and its offset into the page, which fixed
 * elements need added back. Keyboard up = the visible area is well short of the page's own height
 * (documentElement.clientHeight, which the keyboard doesn't change; window.innerHeight does on iOS).
 * Null otherwise: the CSS sizes the sheet.
 */
function useKeyboardFit(open: boolean): React.CSSProperties | null {
  const [fit, setFit] = useState<{ offset: number; height: number } | null>(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!open || !vv) return;
    const update = () => {
      const keyboardUp = window.innerWidth < 640 && document.documentElement.clientHeight - vv.height > 120;
      setFit(keyboardUp ? { offset: Math.round(vv.offsetTop), height: Math.round(vv.height) } : null);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setFit(null);
    };
  }, [open]);
  return fit && { top: 0, bottom: "auto", height: fit.height, transform: `translateY(${fit.offset}px)`, borderRadius: 0 };
}
