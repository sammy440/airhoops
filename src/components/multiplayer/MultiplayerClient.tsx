"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SiteNav } from "@/components/home/SiteNav";
import { AvatarCanvas } from "@/components/ui/AvatarCanvas";
import { useRoom, type Toast } from "@/hooks/useRoom";
import { loadProfile, saveProfile } from "@/lib/game/avatar";
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId } from "@/lib/game/difficulty";
import { formatDuration } from "@/lib/game/modes";
import { api, ApiError, extractRoomCode, loadGuest, ROOM_CODE_LENGTH, saveGuest, type GuestSession, type RoomPhase, type RoomPlayer } from "@/lib/net/api";
import type { MatchMode, SocketStatus } from "@/lib/net/socket";
import { MatchView } from "./MatchView";

const MATCH_MODES: { id: MatchMode; name: string; blurb: string }[] = [
  { id: "shootout", name: "Shootout", blurb: "Take turns, 5 shots each. Most makes wins; ties go to sudden death." },
  { id: "race", name: "Race", blurb: "Everyone shoots at once. Most points before the buzzer wins." },
];
const RACE_LENGTHS = [30, 60, 90, 120];

const modeLabel = (mode: string, raceSeconds?: number) =>
  mode === "shootout" ? "Shootout" : mode === "race" ? `Race · ${formatDuration(raceSeconds ?? 60)}` : mode;

const PHASE_COPY: Record<RoomPhase, { label: string; hint: string }> = {
  lobby: { label: "Lobby", hint: "Waiting for everyone to ready up (2+ players)." },
  ready: { label: "Ready", hint: "Everyone's set. The host can start." },
  in_progress: { label: "In progress", hint: "Match running." },
  finished: { label: "Finished", hint: "Match over. The host can start a rematch." },
};

function roomFromUrl() {
  if (typeof window === "undefined") return null;
  const c = new URLSearchParams(window.location.search).get("room");
  return c ? c.toUpperCase() : null;
}

function setUrlRoom(code: string | null) {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set("room", code);
  else url.searchParams.delete("room");
  window.history.replaceState(null, "", url);
}

export function MultiplayerClient() {
  const [guest, setGuest] = useState<GuestSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore the guest session and validate it with the server.
  useEffect(() => {
    const g = loadGuest();
    if (!g) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage
      setHydrated(true);
      return;
    }
    api
      .me(g.token)
      .then(async (user) => {
        // This device's profile is the source of truth for your look; bring the server up to date.
        const profile = loadProfile();
        if (JSON.stringify(user.avatar ?? null) !== JSON.stringify(profile.avatar)) {
          user = (await api.updateProfile(g.token, { avatar: profile.avatar }).catch(() => null)) ?? user;
        }
        if (!profile.name) saveProfile({ ...profile, name: user.nickname });
        const next = { ...g, user };
        saveGuest(next);
        setGuest(next);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) saveGuest(null);
        else setGuest(g); // server offline: keep the session, show the error on next action
      })
      .finally(() => setHydrated(true));
  }, []);

  const enterRoom = useCallback(async (g: GuestSession, roomCode: string) => {
    setBusy(true);
    setError(null);
    try {
      const room = await api.joinRoom(g.token, roomCode.trim().toUpperCase());
      setCode(room.code);
      setUrlRoom(room.code);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't join that room");
      setUrlRoom(null);
    } finally {
      setBusy(false);
    }
  }, []);

  // Shared link (?room=CODE): join straight away once we have a guest.
  useEffect(() => {
    const linked = roomFromUrl();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the URL once a guest exists
    if (guest && linked && !code) void enterRoom(guest, linked);
  }, [guest, code, enterRoom]);

  const signIn = async (nickname: string) => {
    setBusy(true);
    setError(null);
    try {
      const profile = loadProfile();
      const g = await api.createGuest(nickname, profile.avatar);
      saveProfile({ ...profile, name: g.user.nickname });
      saveGuest(g);
      setGuest(g);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't create a guest");
    } finally {
      setBusy(false);
    }
  };

  const create = async (mode: MatchMode, difficulty: DifficultyId, raceSeconds: number) => {
    if (!guest) return;
    setBusy(true);
    setError(null);
    try {
      const room = await api.createRoom(guest.token, mode, difficulty, raceSeconds);
      setCode(room.code);
      setUrlRoom(room.code);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't create a room");
    } finally {
      setBusy(false);
    }
  };

  const exitRoom = () => {
    setCode(null);
    setUrlRoom(null);
  };

  return (
    <div className="min-h-screen flex-1 bg-ink text-cream">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_70%_0%,rgba(234,58,29,.18),transparent_70%)]" />
      <SiteNav tone="light" />
      <main className="relative mx-auto max-w-5xl px-5 pb-16 sm:px-8">
        <p className="mt-4 flex items-center gap-2 text-xs font-medium text-cream/70">
          <span className="size-1.5 rounded-full bg-hoop" /> Multiplayer
        </p>
        <h1 className="display mt-3 text-6xl text-hoop sm:text-7xl">Play with friends/</h1>

        {error && <p className="mt-6 rounded-xl bg-bad/15 px-4 py-3 text-sm text-bad">{error}</p>}

        <div className="mt-8">
          {!hydrated ? (
            <p className="text-sm text-cream/60">Loading…</p>
          ) : !guest ? (
            <NicknameForm busy={busy} onSubmit={signIn} />
          ) : code ? (
            <RoomView code={code} guest={guest} onExit={exitRoom} />
          ) : (
            <Hub guest={guest} busy={busy} onCreate={create} onJoin={(c) => enterRoom(guest, c)} />
          )}
        </div>
      </main>
    </div>
  );
}

/* ───────── Nickname ───────── */

function NicknameForm({ busy, onSubmit }: { busy: boolean; onSubmit: (n: string) => void }) {
  // Rendered only after hydration, so reading this device's profile is safe.
  const [profile] = useState(loadProfile);
  const [name, setName] = useState(profile.name);
  return (
    <form
      className="max-w-md rounded-3xl border border-cream/10 bg-white/[0.03] p-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(name);
      }}
    >
      <div className="mb-4 flex items-center gap-3">
        <AvatarCanvas avatar={profile.avatar} crop="bust" className="size-14 rounded-2xl bg-white/5" />
        <p className="text-sm text-cream/65">
          Friends will see this player.{" "}
          <Link href="/profile" className="font-semibold text-hoop hover:underline">
            Customize
          </Link>
        </p>
      </div>
      <label htmlFor="nick" className="text-sm text-cream/80">
        Pick a nickname
      </label>
      <input
        id="nick"
        autoFocus
        maxLength={20}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Dayo"
        className="mt-2 w-full rounded-xl border border-cream/15 bg-ink px-4 py-3 text-lg outline-none focus:border-hoop"
      />
      <p className="mt-2 text-xs text-cream/50">No account needed. Your guest pass stays on this device.</p>
      <button type="submit" disabled={busy || name.trim().length < 2} className="mt-5 w-full rounded-full bg-hoop py-3 font-semibold transition hover:bg-hoop-soft disabled:opacity-40">
        {busy ? "Creating…" : "Continue"}
      </button>
    </form>
  );
}

/* ───────── Create / join ───────── */

function Hub({
  guest,
  busy,
  onCreate,
  onJoin,
}: {
  guest: GuestSession;
  busy: boolean;
  onCreate: (m: MatchMode, d: DifficultyId, raceSeconds: number) => void;
  onJoin: (code: string) => void;
}) {
  const [mode, setMode] = useState<MatchMode>("shootout");
  const [raceSeconds, setRaceSeconds] = useState(60);
  const [difficulty, setDifficulty] = useState<DifficultyId>("starter");
  const [joinCode, setJoinCode] = useState("");

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <section className="rounded-3xl border border-cream/10 bg-white/[0.03] p-6">
        <h2 className="display text-3xl">Create a room</h2>
        <div className="mt-2 flex items-center gap-3">
          <AvatarCanvas avatar={guest.user.avatar} crop="bust" className="size-10 rounded-xl bg-white/5" />
          <p className="text-sm text-cream/60">
            Playing as <b className="text-cream">{guest.user.nickname}</b>.{" "}
            <Link href="/profile" className="text-hoop hover:underline">
              Edit player
            </Link>
            <br />
            Invite up to 3 friends.
          </p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {MATCH_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-xl border p-3 text-left transition ${mode === m.id ? "border-hoop bg-hoop/15" : "border-cream/10 hover:border-cream/30"}`}
            >
              <div className="display text-lg">{m.name}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-cream/60">{m.blurb}</div>
            </button>
          ))}
        </div>
        {mode === "race" && (
          <div className="mt-2 grid grid-cols-4 gap-1 rounded-xl bg-white/5 p-1" aria-label="Race length">
            {RACE_LENGTHS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={raceSeconds === s}
                onClick={() => setRaceSeconds(s)}
                className={`rounded-lg py-1.5 font-mono text-xs font-semibold ${raceSeconds === s ? "bg-cream text-ink" : "text-cream/70 hover:text-cream"}`}
              >
                {formatDuration(s)}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 grid grid-cols-4 gap-1 rounded-xl bg-white/5 p-1">
          {DIFFICULTY_ORDER.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDifficulty(d)}
              className={`rounded-lg py-2 text-xs font-semibold ${difficulty === d ? "bg-hoop text-cream" : "text-cream/70 hover:text-cream"}`}
            >
              {DIFFICULTIES[d].name}
            </button>
          ))}
        </div>
        <button type="button" disabled={busy} onClick={() => onCreate(mode, difficulty, raceSeconds)} className="mt-5 w-full rounded-full bg-hoop py-3 font-semibold transition hover:bg-hoop-soft disabled:opacity-40">
          Create room
        </button>
      </section>

      <form
        className="rounded-3xl border border-cream/10 bg-white/[0.03] p-6"
        onSubmit={(e) => {
          e.preventDefault();
          onJoin(joinCode);
        }}
      >
        <h2 className="display text-3xl">Join with a code</h2>
        <p className="mt-1 text-sm text-cream/60">Type the host&apos;s 5-letter code, or paste their invite link.</p>
        <input
          aria-label="Room code"
          value={joinCode}
          autoComplete="off"
          spellCheck={false}
          // No maxLength: it would cut a pasted invite link to "http:" before we can read the code.
          onChange={(e) => setJoinCode(extractRoomCode(e.target.value))}
          placeholder="ABCDE"
          className="mt-5 w-full rounded-xl border border-cream/15 bg-ink px-4 py-3 text-center font-mono text-3xl tracking-[0.4em] uppercase outline-none focus:border-hoop"
        />
        <button type="submit" disabled={busy || joinCode.length !== ROOM_CODE_LENGTH} className="mt-5 w-full rounded-full border border-cream/20 py-3 font-semibold transition hover:border-cream/50 disabled:opacity-40">
          Join room
        </button>
      </form>
    </div>
  );
}

/* ───────── Room ───────── */

function RoomView({ code, guest, onExit }: { code: string; guest: GuestSession; onExit: () => void }) {
  const { room, you, status, closedReason, rtt, toasts, error, send, leave, match, serverNow, toast, names } = useRoom(code, guest.token);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const me = room?.players.find((p) => p.id === you);
  const isHost = room?.host_id === you;
  const seats = room ? Array.from({ length: room.max_players }, (_, i) => room.players[i] ?? null) : [];

  const copy = async (what: "code" | "link") => {
    const text = what === "code" ? code : `${window.location.origin}/multiplayer?room=${code}`;
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };

  if (status === "closed" && closedReason) {
    return (
      <div className="max-w-md rounded-3xl border border-cream/10 bg-white/[0.03] p-6">
        <h2 className="display text-3xl">Disconnected</h2>
        <p className="mt-2 text-sm text-cream/70">{closedReason}.</p>
        <button type="button" onClick={onExit} className="mt-5 w-full rounded-full bg-hoop py-3 font-semibold hover:bg-hoop-soft">
          Back to multiplayer
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.16em] text-cream/50 uppercase">Room code</p>
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={() => copy("code")}
              title="Copy code"
              className="rounded-lg font-mono text-5xl font-bold tracking-[0.25em] transition hover:text-hoop-soft"
            >
              {code}
            </button>
            <div className="flex flex-col gap-1.5">
              <button type="button" onClick={() => copy("code")} className="rounded-full border border-cream/20 px-3 py-1 text-xs hover:border-cream/50">
                {copied === "code" ? "Code copied!" : "Copy code"}
              </button>
              <button type="button" onClick={() => copy("link")} className="rounded-full border border-cream/20 px-3 py-1 text-xs hover:border-cream/50">
                {copied === "link" ? "Link copied!" : "Copy invite link"}
              </button>
            </div>
          </div>
          {room && (
            <p className="mt-2 text-sm text-cream/60">
              {modeLabel(room.mode, room.race_seconds)} · {DIFFICULTIES[room.difficulty as DifficultyId]?.name ?? room.difficulty}
            </p>
          )}
        </div>
        <ConnectionPill status={status} rtt={rtt} />
      </div>

      {room && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white/[0.04] px-4 py-3">
          <span className={`rounded-full px-3 py-1 text-xs font-bold tracking-wide uppercase ${room.phase === "ready" ? "bg-good text-ink" : room.phase === "in_progress" ? "bg-hoop" : "bg-white/10"}`}>
            {PHASE_COPY[room.phase].label}
          </span>
          <span className="text-sm text-cream/70">{PHASE_COPY[room.phase].hint}</span>
        </div>
      )}

      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Players">
        {seats.map((p, i) => (
          <li key={p?.id ?? `empty-${i}`}>{p ? <PlayerCard player={p} isYou={p.id === you} /> : <EmptySeat />}</li>
        ))}
      </ul>

      {room && me && (
        <div className="mt-6 flex flex-wrap gap-3">
          {(room.phase === "lobby" || room.phase === "ready") && (
            <button
              type="button"
              onClick={() => send({ type: "ready", ready: !me.ready })}
              className={`rounded-full px-6 py-3 font-semibold transition ${me.ready ? "bg-good text-ink hover:bg-good/80" : "bg-cream text-ink hover:bg-white"}`}
            >
              {me.ready ? "✓ Ready (tap to undo)" : "I'm ready"}
            </button>
          )}
          {isHost && room.phase === "ready" && (
            <button type="button" onClick={() => send({ type: "start" })} className="rounded-full bg-hoop px-6 py-3 font-semibold hover:bg-hoop-soft">
              Start match
            </button>
          )}
          {isHost && room.phase === "in_progress" && (
            <button type="button" onClick={() => send({ type: "end" })} className="rounded-full border border-cream/20 px-6 py-3 font-semibold hover:border-cream/50">
              End match
            </button>
          )}
          {isHost && room.phase === "finished" && (
            <button type="button" onClick={() => send({ type: "rematch" })} className="rounded-full bg-hoop px-6 py-3 font-semibold hover:bg-hoop-soft">
              Rematch
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              leave();
              onExit();
            }}
            className="ml-auto rounded-full px-5 py-3 text-sm text-cream/60 hover:text-bad"
          >
            Leave room
          </button>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-warn">{error}</p>}
      {room && you && match && (room.phase === "in_progress" || room.phase === "finished") && (
        <MatchView
          room={room}
          you={you}
          match={match}
          names={names}
          isHost={!!isHost}
          serverNow={serverNow}
          send={send}
          toast={toast}
          onLeave={() => {
            leave();
            onExit();
          }}
        />
      )}
      <Toasts toasts={toasts} />
    </div>
  );
}

function PlayerCard({ player, isYou }: { player: RoomPlayer; isYou: boolean }) {
  return (
    <div className={`relative rounded-2xl border p-4 transition ${player.connected ? "border-cream/15 bg-white/[0.04]" : "border-dashed border-cream/15 opacity-60"}`}>
      <div className="flex items-center gap-3">
        <span className="relative size-12 shrink-0">
          <AvatarCanvas avatar={player.avatar} crop="bust" label={`${player.nickname}'s avatar`} className="size-12 rounded-xl bg-white/5" />
          <span
            className={`absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-ink ${player.connected ? "bg-good" : "bg-warn"}`}
            title={player.connected ? "Online" : "Reconnecting"}
          />
        </span>
        <div className="min-w-0">
          <div className="truncate font-semibold">
            {player.nickname}
            {isYou && <span className="ml-1 text-xs font-normal text-cream/50">(you)</span>}
          </div>
          <div className="text-xs text-cream/55">{player.host ? "👑 Host" : "Player"}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className={player.connected ? "text-good" : "text-warn"}>{player.connected ? "Online" : "Reconnecting…"}</span>
        <span className={`rounded-full px-2 py-0.5 font-semibold ${player.ready ? "bg-good/20 text-good" : "bg-white/10 text-cream/60"}`}>
          {player.ready ? "Ready" : "Not ready"}
        </span>
      </div>
    </div>
  );
}

function EmptySeat() {
  return (
    <div className="grid h-full min-h-[116px] place-items-center rounded-2xl border border-dashed border-cream/10 text-sm text-cream/35">
      Open seat
    </div>
  );
}

function ConnectionPill({ status, rtt }: { status: SocketStatus; rtt: number | null }) {
  const [label, color] =
    status === "open"
      ? [`Connected${rtt !== null ? ` · ${rtt} ms` : ""}`, "bg-good"]
      : status === "reconnecting"
        ? ["Reconnecting…", "bg-warn"]
        : status === "connecting"
          ? ["Connecting…", "bg-warn"]
          : ["Offline", "bg-bad"];
  return (
    <span className="glass flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-xs" aria-live="polite">
      <span className={`size-2 rounded-full ${color} ${status !== "open" ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-count-pop rounded-xl px-4 py-2 text-sm font-medium shadow-xl ${t.tone === "good" ? "bg-good text-ink" : t.tone === "warn" ? "bg-warn text-ink" : "bg-cream text-ink"}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
