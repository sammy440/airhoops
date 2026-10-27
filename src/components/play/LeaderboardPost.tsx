"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { loadProfile, saveProfile, validName } from "@/lib/game/avatar";
import { DIFFICULTIES, type DifficultyId } from "@/lib/game/difficulty";
import { api, ApiError, loadGuest, saveGuest, type RunSubmission } from "@/lib/net/api";

type State =
  | { kind: "idle" }
  | { kind: "posting" }
  | { kind: "posted"; rank: number; best: number }
  | { kind: "error"; message: string };

/**
 * Game Over: posts the run to the leaderboard. Players who already have a
 * guest pass (multiplayer or a previous post) post automatically; first-timers
 * opt in with one tap, since that creates a record on the server.
 */
export function LeaderboardPost({ run }: { run: RunSubmission & { id: number } }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [profile] = useState(loadProfile);
  const [hasGuest] = useState(() => !!loadGuest());
  const [name, setName] = useState(profile.name);
  const postedRef = useRef<number | null>(null);

  const post = async (nickname?: string) => {
    if (postedRef.current === run.id) return;
    postedRef.current = run.id;
    setState({ kind: "posting" });
    try {
      let g = loadGuest();
      if (!g) {
        g = await api.createGuest(nickname ?? name.trim(), profile.avatar);
        saveGuest(g);
        saveProfile({ ...profile, name: g.user.nickname });
      }
      const res = await api.submitScore(g.token, { mode: run.mode, difficulty: run.difficulty, score: run.score, shots: run.shots, makes: run.makes });
      setState({ kind: "posted", rank: res.rank, best: res.best });
    } catch (e) {
      postedRef.current = null;
      if (e instanceof ApiError && e.status === 401) saveGuest(null);
      setState({ kind: "error", message: e instanceof ApiError ? e.message : "Couldn't post your score" });
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-post once per finished run
    if (hasGuest && run.score > 0) void post();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per run
  }, [run.id]);

  if (run.score <= 0) return null;
  const board = `/leaderboard?mode=${run.mode}&difficulty=${run.difficulty}`;
  const where = `${DIFFICULTIES[run.difficulty as DifficultyId]?.name ?? run.difficulty}, all-time`;

  return (
    <div className="mt-4 rounded-2xl border border-cream/10 bg-white/[0.03] px-4 py-3 text-sm" aria-live="polite">
      {state.kind === "posted" ? (
        <div className="flex items-center justify-between gap-3">
          <span>
            <b className="display text-xl text-sun">#{state.rank}</b> <span className="text-cream/70">on the leaderboard ({where})</span>
          </span>
          <Link href={board} className="shrink-0 font-semibold text-hoop hover:underline">
            View →
          </Link>
        </div>
      ) : state.kind === "posting" ? (
        <span className="text-cream/60">Posting to the leaderboard…</span>
      ) : hasGuest ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-bad">{state.kind === "error" ? state.message : ""}</span>
          <button type="button" onClick={() => post()} className="shrink-0 font-semibold text-hoop hover:underline">
            Retry
          </button>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (validName(name)) void post(name.trim());
          }}
        >
          <label htmlFor="lb-name" className="w-full text-cream/70">
            Post this score to the leaderboard?
          </label>
          <input
            id="lb-name"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="min-w-0 flex-1 rounded-lg border border-cream/15 bg-ink px-3 py-2 outline-none focus:border-hoop"
          />
          <button type="submit" disabled={!validName(name)} className="rounded-full bg-cream px-4 py-2 font-semibold text-ink disabled:opacity-40">
            Post
          </button>
          {state.kind === "error" && <span className="w-full text-xs text-bad">{state.message}</span>}
          <span className="w-full text-[11px] text-cream/60">Shares your name, look and score. Never video.</span>
        </form>
      )}
    </div>
  );
}
