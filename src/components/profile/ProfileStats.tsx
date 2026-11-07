"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DIFFICULTIES, type DifficultyId } from "@/lib/game/difficulty";
import { formatDuration } from "@/lib/game/modes";
import { syncProgress } from "@/lib/game/progress";
import { dailyRates, insights, pct, type Insight } from "@/lib/game/trends";
import { api, loadGuest, type HistoryMatch, type ShootingStats } from "@/lib/net/api";

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];
const PAGE = 10;

const modeName = (m: HistoryMatch) =>
  m.mode === "shootout" ? "Shootout" : m.mode === "race" ? `Race · ${formatDuration(m.race_seconds ?? 60)}` : "H-O-R-S-E";

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Your game: shooting trends (solo + multiplayer) and match history, from the server. */
export function ProfileStats() {
  const [token, setToken] = useState<string | null>(null);
  const [range, setRange] = useState<Range>(30);
  const [stats, setStats] = useState<ShootingStats | null>(null);
  const [matches, setMatches] = useState<HistoryMatch[]>([]);
  const [more, setMore] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [rating, setRating] = useState<{ value: number; provisional: boolean } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage
    setToken(loadGuest()?.token ?? null);
  }, []);

  useEffect(() => {
    if (!token) return;
    let live = true;
    (async () => {
      setState("loading");
      try {
        await syncProgress(); // so the shots you just took are in the numbers
        const [s, m, me] = await Promise.all([api.myStats(token, range), api.myMatches(token, { limit: PAGE }), api.me(token)]);
        if (!live) return;
        setStats(s);
        setRating(me.rating !== undefined ? { value: me.rating, provisional: !!me.provisional } : null);
        setMatches(m);
        setMore(m.length === PAGE);
        setState("ready");
      } catch {
        if (live) setState("error");
      }
    })();
    return () => {
      live = false;
    };
  }, [token, range]);

  const loadMore = useCallback(async () => {
    if (!token || !matches.length) return;
    try {
      const next = await api.myMatches(token, { limit: PAGE, before: matches[matches.length - 1].started_at });
      setMatches((m) => [...m, ...next]);
      setMore(next.length === PAGE);
    } catch {
      setMore(false);
    }
  }, [token, matches]);

  return (
    <section id="stats" className="scroll-mt-6 rounded-3xl border border-ink/10 bg-card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="display text-2xl">Your game</h2>
          <p className="text-xs text-ink/55">Every shot you take, solo and in matches.</p>
        </div>
        {token && (
          <div className="flex rounded-full border border-ink/10 p-1 text-xs font-semibold" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                onClick={() => setRange(r)}
                className={`rounded-full px-3 py-1 transition ${range === r ? "bg-ink text-cream" : "text-ink/60 hover:text-ink"}`}
              >
                {r} days
              </button>
            ))}
          </div>
        )}
      </div>

      {!token ? (
        <p className="text-sm text-ink/65">
          Your stats are kept online once you have a player there: play a{" "}
          <Link href="/multiplayer" className="font-semibold underline underline-offset-2">
            multiplayer
          </Link>{" "}
          game or sign in with Google above.
        </p>
      ) : state === "error" ? (
        <p className="text-sm text-ink/65">Couldn&apos;t load your stats. Check your connection and try again.</p>
      ) : !stats ? (
        <p className="text-sm text-ink/45" aria-live="polite">
          Loading…
        </p>
      ) : (
        <div className={state === "loading" ? "opacity-60 transition" : "transition"}>
          <Tiles stats={stats} rating={rating} />
          <Insights items={insights(stats)} />
          <RateChart stats={stats} />
          <History matches={matches} more={more} onMore={loadMore} />
        </div>
      )}
    </section>
  );
}

function Tiles({ stats, rating }: { stats: ShootingStats; rating: { value: number; provisional: boolean } | null }) {
  const t = stats.totals;
  const record = Object.values(stats.record).reduce((a, r) => ({ played: a.played + r.played, wins: a.wins + r.wins }), { played: 0, wins: 0 });
  const tiles = [
    { label: "Shots", value: t.shots.toLocaleString() },
    { label: "From the floor", value: t.shots ? `${pct(t.makes, t.shots)}%` : "–" },
    { label: "Swishes", value: t.swishes.toLocaleString() },
    { label: "Matches won", value: record.played ? `${record.wins} of ${record.played}` : "–", note: "all time" },
    ...(rating ? [{ label: "Rating", value: String(rating.value), note: rating.provisional ? "settling" : undefined }] : []),
  ];
  return (
    <dl className={`grid grid-cols-2 gap-2 ${tiles.length > 4 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
      {tiles.map((s) => (
        <div key={s.label} className="rounded-2xl bg-paper px-4 py-3">
          <dt className="text-xs text-ink/55">
            {s.label}
            {s.note && <span className="text-ink/35"> · {s.note}</span>}
          </dt>
          <dd className="display mt-1 text-2xl tabular-nums">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const TONE: Record<Insight["tone"], string> = { good: "bg-good", work: "bg-hoop", neutral: "bg-stone" };

function Insights({ items }: { items: Insight[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-4 grid gap-2">
      {items.map((i) => (
        <li key={i.id} className="flex gap-3 rounded-2xl border border-ink/10 px-4 py-3">
          <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${TONE[i.tone]}`} />
          <div>
            <p className="text-sm font-semibold">{i.title}</p>
            <p className="text-xs text-ink/60">{i.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Make rate per day with play: one bar a day, height = %, with hover/focus tooltips and a table for screen readers. */
function RateChart({ stats }: { stats: ShootingStats }) {
  const rows = dailyRates(stats);
  const [hover, setHover] = useState<number | null>(null);
  if (rows.length < 2) return null;
  const W = 100 / rows.length;
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  const h = hover !== null ? rows[hover] : null;

  return (
    <figure className="mt-5">
      <figcaption className="mb-2 flex items-baseline justify-between text-xs text-ink/55">
        <span className="font-semibold">Make rate by day</span>
        <span aria-live="polite" className="tabular-nums text-ink/70">
          {h ? `${day(h[0])}: ${h[1]}% · ${h[2]} shots` : "Hover a day"}
        </span>
      </figcaption>
      <div className="relative h-28" aria-hidden>
        {[50, 100].map((g) => (
          <div key={g} className="absolute inset-x-0 border-t border-ink/10" style={{ bottom: `${g}%` }}>
            <span className="absolute -top-2 right-0 bg-card pl-1 font-mono text-[10px] text-ink/40">{g}%</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end border-b border-ink/20 pr-8">
          {rows.map(([d, rate], i) => (
            <button
              key={d}
              type="button"
              tabIndex={-1}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setHover(i)}
              className="flex h-full items-end px-px"
              style={{ width: `${W}%` }}
            >
              <span
                className={`block w-full rounded-t-[4px] transition-colors ${hover === i ? "bg-ink" : "bg-hoop"}`}
                style={{ height: `${Math.max(rate, 1.5)}%` }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between pr-8 font-mono text-[10px] text-ink/40" aria-hidden>
        <span>{day(rows[0][0])}</span>
        <span>{day(rows[rows.length - 1][0])}</span>
      </div>
      <table className="sr-only">
        <caption>Make rate by day</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Make rate</th>
            <th>Shots</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([d, rate, shots]) => (
            <tr key={d}>
              <td>{day(d)}</td>
              <td>{rate}%</td>
              <td>{shots}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function History({ matches, more, onMore }: { matches: HistoryMatch[]; more: boolean; onMore: () => void }) {
  return (
    <div className="mt-6">
      <h3 className="mb-2 text-xs font-semibold text-ink/55">Recent matches</h3>
      {!matches.length ? (
        <p className="text-sm text-ink/60">
          No matches yet.{" "}
          <Link href="/multiplayer" className="font-semibold underline underline-offset-2">
            Play a friend
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y divide-ink/10 rounded-2xl border border-ink/10">
          {matches.map((m) => (
            <MatchRow key={m.id} m={m} />
          ))}
        </ul>
      )}
      {more && (
        <button type="button" onClick={onMore} className="mt-3 w-full rounded-full border border-ink/15 py-2 text-sm font-semibold hover:border-ink/40">
          Show older matches
        </button>
      )}
    </div>
  );
}

function MatchRow({ m }: { m: HistoryMatch }) {
  const others = m.players.filter((p) => p.user_id !== m.you.user_id);
  const aborted = m.reason === "aborted";
  const result = aborted ? "Abandoned" : m.you.won ? (m.players.filter((p) => p.won).length > 1 ? "Shared win" : "Won") : m.you.forfeited ? "Left" : "Lost";
  const tone = aborted ? "text-ink/45" : m.you.won ? "text-good" : "text-ink/70";
  const yourLine = m.mode === "horse" ? `${"HORSE".slice(0, m.you.letters ?? 0) || "no letters"}` : `${m.you.points} pts`;
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          <span className={tone}>{result}</span>
          <span className="text-ink/45"> · </span>
          {modeName(m)}
          <span className="text-ink/45"> · {DIFFICULTIES[m.difficulty as DifficultyId]?.name ?? m.difficulty}</span>
        </p>
        <p className="truncate text-xs text-ink/55">
          {others.length ? `vs ${others.map((p) => p.nickname).join(", ")}` : "Opponent left AirHoops"} · {when(m.started_at)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-sm tabular-nums">{yourLine}</p>
        <p className="text-xs text-ink/50 tabular-nums">
          {m.you.makes}/{m.you.shots} · {pct(m.you.makes, m.you.shots)}%
          {typeof m.you.rating_change === "number" && (
            <span className={m.you.rating_change > 0 ? "text-good" : m.you.rating_change < 0 ? "text-bad" : ""}>
              {" "}
              · {m.you.rating_change >= 0 ? "+" : "−"}
              {Math.abs(m.you.rating_change)}
            </span>
          )}
        </p>
      </div>
    </li>
  );
}
