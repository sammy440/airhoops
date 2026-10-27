"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteNav } from "@/components/home/SiteNav";
import { AvatarCanvas } from "@/components/ui/AvatarCanvas";
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId } from "@/lib/game/difficulty";
import { formatDuration } from "@/lib/game/modes";
import { api, ApiError, loadGuest, type LeaderboardEntry, type Period, type PersonalBests } from "@/lib/net/api";

const BOARDS = [
  { group: "Solo", modes: ["timed60", "timed30", "timed90", "timed120", "streak"] },
  { group: "Multiplayer", modes: ["shootout", "race60", "race30", "race90", "race120"] },
];
const PERIODS: { id: Period; label: string }[] = [
  { id: "day", label: "Today" },
  { id: "week", label: "This week" },
  { id: "all", label: "All time" },
];
const MODE_RE = /^(streak|timed\d{2,4}|shootout|race\d{2,3})$/;

export function boardName(mode: string) {
  if (mode === "streak") return "Streak";
  if (mode === "shootout") return "Shootout";
  const timed = mode.match(/^timed(\d+)$/);
  if (timed) return `Timed ${formatDuration(Number(timed[1]))}`;
  const race = mode.match(/^race(\d+)$/);
  if (race) return `Race ${formatDuration(Number(race[1]))}`;
  return mode;
}

const unit = (mode: string) => (mode === "streak" ? "in a row" : "pts");

type Load<T> = { kind: "loading" } | { kind: "ok"; data: T } | { kind: "error"; message: string };

export function LeaderboardClient() {
  const [mode, setMode] = useState("timed60");
  const [difficulty, setDifficulty] = useState<DifficultyId | "">("");
  const [period, setPeriod] = useState<Period>("week");
  const [board, setBoard] = useState<Load<LeaderboardEntry[]>>({ kind: "loading" });
  const [mine, setMine] = useState<PersonalBests | null>(null);
  const [me, setMe] = useState<{ id: string; token: string } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Deep links from Game Over: /leaderboard?mode=timed60&difficulty=starter
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const m = q.get("mode");
    const d = q.get("difficulty");
    const p = q.get("period");
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from the URL and localStorage */
    if (m && MODE_RE.test(m)) setMode(m);
    if (d && d in DIFFICULTIES) setDifficulty(d as DifficultyId);
    if (p === "day" || p === "week" || p === "all") setPeriod(p);
    const g = loadGuest();
    if (g) setMe({ id: g.user.id, token: g.token });
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ mode, period, ...(difficulty ? { difficulty } : {}) }).toString();
    window.history.replaceState(null, "", url);

    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show loading while the new board is fetched
    setBoard({ kind: "loading" });
    api
      .leaderboard({ mode, period, difficulty: difficulty || undefined, limit: 50 })
      .then((data) => live && setBoard({ kind: "ok", data }))
      .catch((e: unknown) => live && setBoard({ kind: "error", message: e instanceof ApiError ? e.message : "Couldn't load the leaderboard" }));
    if (me)
      api
        .myBests(me.token, { mode, difficulty: difficulty || undefined })
        .then((data) => live && setMine(data))
        .catch(() => live && setMine(null));
    return () => {
      live = false;
    };
  }, [hydrated, mode, difficulty, period, me]);

  const customMode = !BOARDS.some((b) => b.modes.includes(mode)) ? mode : null;

  return (
    <div className="min-h-screen flex-1 bg-ink text-cream">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(246,161,58,.14),transparent_70%)]" />
      <SiteNav tone="light" />
      <main id="main" className="relative mx-auto max-w-5xl px-5 pb-16 sm:px-8">
        <p className="mt-4 flex items-center gap-2 text-xs font-medium text-cream/70">
          <span className="size-1.5 rounded-full bg-hoop" /> Leaderboards
        </p>
        <h1 className="display mt-3 text-6xl text-hoop sm:text-7xl">Who&apos;s hot/</h1>

        {/* Board picker */}
        <div className="mt-8 grid gap-3">
          {BOARDS.map((b) => (
            <div key={b.group} className="flex flex-wrap items-center gap-2" role="group" aria-label={`${b.group} boards`}>
              <span className="w-24 text-[11px] font-semibold tracking-[0.14em] text-cream/50 uppercase">{b.group}</span>
              {[...b.modes, ...(b.group === "Solo" && customMode?.startsWith("timed") ? [customMode] : [])].map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${mode === m ? "border-hoop bg-hoop text-cream" : "border-cream/15 text-cream/75 hover:border-cream/40"}`}
                >
                  {boardName(m)}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-xl bg-white/5 p-1" role="group" aria-label="Period">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={period === p.id}
                onClick={() => setPeriod(p.id)}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${period === p.id ? "bg-cream text-ink" : "text-cream/70 hover:text-cream"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-cream/70">
            Difficulty
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as DifficultyId | "")}
              className="rounded-lg border border-cream/15 bg-ink px-3 py-1.5 text-cream outline-none focus:border-hoop"
            >
              <option value="">All</option>
              {DIFFICULTY_ORDER.map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTIES[d].name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Personal bests */}
        {me && (
          <section aria-label="Your personal bests" className="mt-6 grid grid-cols-3 gap-2 rounded-3xl border border-cream/10 bg-white/[0.03] p-4">
            {PERIODS.map((p) => {
              const pb = mine?.[p.id];
              return (
                <div key={p.id} className={`rounded-2xl px-3 py-2 ${period === p.id ? "bg-white/[0.06]" : ""}`}>
                  <div className="text-[10px] font-semibold tracking-[0.14em] text-cream/50 uppercase">Your best · {p.label}</div>
                  {pb ? (
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="display text-3xl text-sun">{pb.best}</span>
                      <span className="text-xs text-cream/60">#{pb.rank}</span>
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-cream/55">No runs</div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* Board */}
        <section className="mt-6 overflow-hidden rounded-3xl border border-cream/10 bg-white/[0.03]" aria-live="polite" aria-busy={board.kind === "loading"}>
          <div className="flex items-center justify-between border-b border-cream/10 px-5 py-3 text-xs text-cream/55">
            <span>
              {boardName(mode)} · {difficulty ? DIFFICULTIES[difficulty].name : "All difficulties"} · {PERIODS.find((p) => p.id === period)?.label}
            </span>
            <span>{mode.startsWith("timed") || mode === "streak" ? "Best run per player" : "Server-verified matches"}</span>
          </div>
          {board.kind === "loading" ? (
            <ol>
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="flex items-center gap-4 border-b border-cream/5 px-5 py-3 last:border-0">
                  <span className="h-4 w-6 animate-pulse rounded bg-white/10" />
                  <span className="size-10 animate-pulse rounded-xl bg-white/10" />
                  <span className="h-4 w-32 animate-pulse rounded bg-white/10" />
                </li>
              ))}
            </ol>
          ) : board.kind === "error" ? (
            <p className="px-5 py-10 text-center text-sm text-bad">{board.message}</p>
          ) : board.data.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="display text-3xl">No scores yet</p>
              <p className="mt-1 text-sm text-cream/60">Be the first on this board.</p>
              <Link href={mode.startsWith("timed") || mode === "streak" ? "/play" : "/multiplayer"} className="mt-4 inline-block rounded-full bg-hoop px-6 py-2.5 text-sm font-semibold hover:bg-hoop-soft">
                {mode.startsWith("timed") || mode === "streak" ? "Play" : "Start a match"}
              </Link>
            </div>
          ) : (
            <ol>
              {board.data.map((e) => {
                const you = e.user_id === me?.id;
                return (
                  <li
                    key={e.user_id}
                    className={`flex items-center gap-4 border-b border-cream/5 px-5 py-2.5 last:border-0 ${you ? "bg-hoop/10" : ""}`}
                    aria-current={you ? "true" : undefined}
                  >
                    <span className={`w-8 text-center font-mono text-lg font-bold tabular-nums ${e.rank <= 3 ? "text-sun" : "text-cream/50"}`}>
                      {e.rank <= 3 ? ["🥇", "🥈", "🥉"][e.rank - 1] : e.rank}
                      <span className="sr-only">{e.rank <= 3 ? `Rank ${e.rank}` : ""}</span>
                    </span>
                    <AvatarCanvas avatar={e.avatar} crop="bust" label={`${e.nickname}'s avatar`} className="size-10 shrink-0 rounded-xl bg-white/5" />
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {e.nickname}
                      {you && <span className="ml-1 text-xs font-normal text-cream/50">(you)</span>}
                    </span>
                    <span className="hidden text-xs text-cream/60 sm:inline">
                      {e.games} {e.games === 1 ? "run" : "runs"}
                    </span>
                    <span className="w-24 text-right">
                      <b className="display text-2xl">{e.best}</b> <span className="text-xs text-cream/50">{unit(mode)}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
        <p className="mt-4 text-xs text-cream/60">
          Solo scores are posted from Game Over. Multiplayer boards are refereed by the server. Today = last 24 hours, this week = last 7 days.
        </p>
      </main>
    </div>
  );
}
