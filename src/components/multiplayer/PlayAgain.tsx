"use client";

import { useEffect, useState } from "react";
import { AvatarCanvas } from "@/components/ui/AvatarCanvas";
import { DIFFICULTIES, type DifficultyId } from "@/lib/game/difficulty";
import { formatDuration } from "@/lib/game/modes";
import { api, type GuestSession, type HistoryMatch, type HistoryPlayer, type Invite } from "@/lib/net/api";

/** How often the hub looks for invites (the API allows 30 looks a minute). */
const POLL_MS = 10_000;
const MAX_OPPONENTS = 6;

const modeLabel = (mode: string, raceSeconds: number | null) =>
  mode === "shootout" ? "Shootout" : mode === "race" ? `Race · ${formatDuration(raceSeconds ?? 60)}` : mode === "horse" ? "H-O-R-S-E" : mode;

export interface Opponent {
  player: HistoryPlayer;
  /** The last match you played them: its settings are the rematch's */
  last: HistoryMatch;
  played: number;
  /** Matches you finished above them */
  wins: number;
}

/** Everyone you've played recently, most recent first, with your record against them. */
export function recentOpponents(matches: HistoryMatch[], you: string, max = MAX_OPPONENTS): Opponent[] {
  const byId = new Map<string, Opponent>();
  for (const m of matches) {
    for (const p of m.players) {
      if (p.user_id === you) continue;
      const o = byId.get(p.user_id) ?? { player: p, last: m, played: 0, wins: 0 };
      o.played += 1;
      if (m.reason !== "aborted" && m.you.rank < p.rank) o.wins += 1; // finished above them
      byId.set(p.user_id, o);
    }
  }
  return [...byId.values()].slice(0, max);
}

/** Invites to you: polled while you're on the hub. */
export function InviteInbox({ guest, onJoin }: { guest: GuestSession; onJoin: (code: string) => void }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  useEffect(() => {
    let live = true;
    const look = () =>
      api
        .invites(guest.token)
        .then((i) => live && setInvites(i))
        .catch(() => {});
    void look();
    const id = window.setInterval(() => document.visibilityState === "visible" && void look(), POLL_MS);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [guest.token]);

  if (!invites.length) return null;
  const dismiss = (i: Invite) => {
    setInvites((all) => all.filter((x) => x.from_id !== i.from_id));
    void api.dismissInvite(guest.token, i.from_id).catch(() => {});
  };
  return (
    <ul className="grid gap-2 md:col-span-2" aria-live="polite">
      {invites.map((i) => (
        <li key={i.from_id} className="flex flex-wrap items-center gap-3 rounded-3xl border border-court/40 bg-court/10 p-4">
          <AvatarCanvas avatar={i.avatar} crop="bust" className="size-10 rounded-xl bg-card" />
          <p className="min-w-0 flex-1 text-sm">
            <b>{i.nickname}</b> invited you: {modeLabel(i.mode, i.race_seconds)} · {DIFFICULTIES[i.difficulty as DifficultyId]?.name ?? i.difficulty}
            {i.best_of > 1 && ` · best of ${i.best_of}`}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => dismiss(i)} className="rounded-full border border-ink/15 px-4 py-2 text-sm hover:border-ink/40">
              Not now
            </button>
            <button type="button" onClick={() => onJoin(i.code)} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-cream hover:bg-hoop">
              Join
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** "Play again": recent opponents, one tap to make a room with the same settings and invite them. */
export function RecentOpponents({ guest, busy, onInvite }: { guest: GuestSession; busy: boolean; onInvite: (o: Opponent) => void }) {
  const [opponents, setOpponents] = useState<Opponent[] | null>(null);
  useEffect(() => {
    let live = true;
    api
      .myMatches(guest.token, { limit: 30 })
      .then((m) => live && setOpponents(recentOpponents(m, guest.user.id)))
      .catch(() => live && setOpponents([]));
    return () => {
      live = false;
    };
  }, [guest.token, guest.user.id]);

  if (!opponents?.length) return null;
  return (
    <section className="rounded-3xl border border-ink/10 bg-card p-6 md:col-span-2">
      <h2 className="display text-3xl">Play again</h2>
      <p className="mt-1 text-sm text-ink/60">Make a room with the same game and invite them. They see it next time they&apos;re on this page.</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {opponents.map((o) => (
          <li key={o.player.user_id} className="flex items-center gap-3 rounded-2xl border border-ink/10 px-3 py-2.5">
            <AvatarCanvas avatar={o.player.avatar} crop="bust" className="size-10 rounded-xl bg-paper" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{o.player.nickname}</p>
              <p className="truncate text-xs text-ink/55">
                {modeLabel(o.last.mode, o.last.race_seconds)} · you&apos;re {o.wins}–{o.played - o.wins}
              </p>
            </div>
            <button type="button" disabled={busy} onClick={() => onInvite(o)} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-cream hover:bg-hoop disabled:opacity-40">
              Invite
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
