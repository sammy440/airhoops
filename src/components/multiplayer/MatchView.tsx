"use client";

import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SkeletonOverlayHandle } from "@/components/lab/SkeletonOverlay";
import { CameraPip, useCourtInset } from "@/components/play/CameraPip";
import { Logo } from "@/components/ui/Logo";
import type { MatchState } from "@/hooks/useRoom";
import { useThrowInput } from "@/hooks/useThrowInput";
import { DEFAULT_AVATAR, loadProfile, sanitizeAvatar } from "@/lib/game/avatar";
import { courtThemeId, DEFAULT_COURT_THEME, type CourtThemeId } from "@/lib/game/courts";
import { calibratedLaunch, loadCalibration } from "@/lib/game/calibration";
import { courtFor, DIFFICULTIES, type DifficultyId } from "@/lib/game/difficulty";
import { Game } from "@/lib/game/game";
import type { Launch, ShotSim } from "@/lib/game/physics";
import { setMuted, unlockAudio } from "@/lib/game/sfx";
import { keyboardThrow, throwToLaunch } from "@/lib/game/shot";
import type { RoomState, Series } from "@/lib/net/api";
import type { ClientMessage, ServerShot } from "@/lib/net/socket";
import type { KinematicsFrame } from "@/lib/pose/kinematics";
import { shareLink } from "@/lib/share";
import type { ThrowEvent } from "@/lib/pose/throwDetector";

const TAP_MS = 180;
const FULL_CHARGE_MS = 1400;
const TAP_WOBBLE = 0.04;
const KEYBOARD_THROW = { angle: 30, arc: 0.7 }; // → 52° launch, same as solo keyboard

interface Props {
  room: RoomState;
  you: string;
  match: MatchState;
  /** id → nickname for everyone seen in the room (incl. players who left) */
  names: Record<string, string>;
  isHost: boolean;
  serverNow: () => number | null;
  send: (m: ClientMessage) => void;
  toast: (text: string, tone?: "info" | "good" | "warn") => void;
  onLeave: () => void;
}

/** Rebuilds a playable simulation from the server's authoritative shot. */
function toSim(shot: ServerShot): ShotSim | null {
  if (!shot.path || !shot.launch || shot.duration === undefined) return null;
  return {
    launch: shot.launch,
    path: shot.path,
    events: shot.events ?? [],
    result: { scored: shot.scored, swish: !!shot.swish, bank: !!shot.bank, miss: shot.miss ?? null, error: shot.error ?? 0 },
    duration: shot.duration,
  };
}

function loadPlayPrefs(): { camera: boolean; sound: boolean; courtTheme: CourtThemeId } {
  try {
    const p = JSON.parse(localStorage.getItem("airhoops.play.prefs") ?? "{}");
    return { camera: p.camera ?? true, sound: p.sound ?? true, courtTheme: courtThemeId(p.courtTheme) };
  } catch {
    return { camera: true, sound: true, courtTheme: DEFAULT_COURT_THEME };
  }
}

export function MatchView({ room, you, match, names, isHost, serverNow, send, toast, onLeave }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pipRef = useRef<SkeletonOverlayHandle>(null);
  const pipBoxRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const labelRef = useRef<string | null>(null);
  const predictedRef = useRef<ShotSim | null>(null);
  const handledShotRef = useRef<string | null>(null);

  const [prefs] = useState(loadPlayPrefs);
  const [calibration] = useState(loadCalibration);
  const start = match.start;
  const difficulty = DIFFICULTIES[start.difficulty as DifficultyId] ?? DIFFICULTIES.starter;
  const court = useMemo(() => courtFor(difficulty), [difficulty]);

  // ── Server-synced clock for timers, turn clocks and the moving hoop ──
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setNow(serverNow()), 100);
    return () => window.clearInterval(id);
  }, [serverNow]);

  // ── Game engine ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const game = new Game(canvas, {
      onResult: () => {
        const label = labelRef.current;
        labelRef.current = null;
        return label ?? undefined;
      },
    });
    gameRef.current = game;
    const ro = new ResizeObserver(() => game.resize(wrap.clientWidth, wrap.clientHeight));
    ro.observe(wrap);
    game.resize(wrap.clientWidth, wrap.clientHeight);
    game.start();
    return () => {
      ro.disconnect();
      game.stop();
      gameRef.current = null;
    };
  }, []);
  useEffect(() => {
    gameRef.current?.setTheme(prefs.courtTheme);
  }, [prefs.courtTheme]);
  useEffect(() => {
    setMuted(!prefs.sound);
    unlockAudio();
  }, [prefs.sound]);
  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    game.setCourt(court);
    game.setPhaseSource(() => {
      const n = serverNow();
      return n === null ? null : n - start.startAt;
    });
  }, [court, serverNow, start.startAt]);
  const myWind = match.scores[you]?.wind ?? 0;
  useEffect(() => {
    gameRef.current?.setWind(myWind);
  }, [myWind]);

  // ── Can I shoot right now? ──
  const ended = !!match.result || (start.endsAt !== null && now !== null && now >= start.endsAt);
  const started = now !== null && now >= start.startAt;
  const forfeited = !!match.scores[you]?.forfeited;
  const turn = match.turn;
  const myTurn = start.mode === "race" || turn?.playerId === you;
  const turnOpen = start.mode === "race" || (turn !== null && now !== null && now >= turn.availableAt);
  const canShoot = started && !ended && !forfeited && myTurn && turnOpen;

  // ── Who's on the court: you, or (shootout) whoever's turn it is, in their own look ──
  const shooterId = start.mode === "shootout" && turn ? turn.playerId : you;
  const watching = shooterId !== you;
  const watchingRef = useRef(watching);
  const shooterAvatar = room.players.find((p) => p.id === shooterId)?.avatar;
  const shooterLook = JSON.stringify(shooterAvatar ? sanitizeAvatar(shooterAvatar) : watching ? DEFAULT_AVATAR : null);
  useEffect(() => {
    watchingRef.current = watching;
    const game = gameRef.current;
    if (!game) return;
    // Your own look falls back to this device's profile (e.g. before the server has it).
    game.setAvatar(shooterLook === "null" ? loadProfile().avatar : JSON.parse(shooterLook));
    if (watching) game.setPose(undefined); // their stance, not your camera
  }, [shooterLook, watching]);

  const canShootRef = useRef(canShoot);
  useEffect(() => {
    canShootRef.current = canShoot;
  }, [canShoot]);

  /** Local prediction for instant feedback; the server's call decides the score. */
  const shoot = useCallback(
    (launch: Launch, payload: { power: number; angle: number; arc: number }) => {
      const game = gameRef.current;
      if (!game || !canShootRef.current || !game.canThrow()) return;
      const t = serverNow();
      const sim = game.throwBall(launch);
      if (!sim || t === null) return;
      predictedRef.current = sim;
      send({ type: "throw", ...payload, t });
    },
    [send, serverNow],
  );

  const onThrow = useCallback(
    (ev: ThrowEvent) => {
      if (calibration) {
        const { launch, power } = calibratedLaunch(ev, calibration, court, difficulty);
        shoot(launch, { power, angle: ev.angle, arc: ev.arc });
      } else {
        shoot(throwToLaunch(ev), { power: ev.power, angle: ev.angle, arc: ev.arc });
      }
    },
    [calibration, court, difficulty, shoot],
  );
  const onPose = useCallback((smoothed: NormalizedLandmark[] | undefined, kin: KinematicsFrame | null) => {
    if (!watchingRef.current) gameRef.current?.setPose(smoothed);
    pipRef.current?.draw(smoothed, { kin });
  }, []);
  const input = useThrowInput(videoRef, { enabled: prefs.camera, onThrow, onPose });
  useCourtInset(gameRef, pipBoxRef, prefs.camera);
  useEffect(() => {
    gameRef.current?.setLoaded(canShoot && input.tracker.status === "ready" && input.detectorState === "WINDUP");
  }, [canShoot, input.tracker.status, input.detectorState]);

  // Keyboard, mouse or touch: tap Space / the court = medium shot, hold = charge.
  useEffect(() => {
    let downAt: number | null = null;
    let raf = 0;
    const tick = () => {
      if (downAt === null) return;
      gameRef.current?.setCharge(Math.min(1, (performance.now() - downAt) / FULL_CHARGE_MS));
      raf = requestAnimationFrame(tick);
    };
    const startCharge = () => {
      if (downAt !== null || !canShootRef.current) return false;
      downAt = performance.now();
      raf = requestAnimationFrame(tick);
      return true;
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (!e.repeat) startCharge();
    };
    const release = () => {
      if (downAt === null) return;
      const held = performance.now() - downAt;
      downAt = null;
      cancelAnimationFrame(raf);
      gameRef.current?.setCharge(null);
      const power =
        held < TAP_MS ? keyboardThrow(undefined, court).power + (Math.random() * 2 - 1) * TAP_WOBBLE : Math.min(1, held / FULL_CHARGE_MS);
      shoot(throwToLaunch({ power, ...KEYBOARD_THROW }), { power, ...KEYBOARD_THROW });
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || downAt === null) return;
      e.preventDefault();
      release();
    };
    const canvas = canvasRef.current;
    let pointer: number | null = null;
    const onPointerDown = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return;
      if (startCharge()) {
        pointer = e.pointerId;
        canvas?.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      release();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    canvas?.addEventListener("pointerdown", onPointerDown);
    canvas?.addEventListener("pointerup", onPointerUp);
    canvas?.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      canvas?.removeEventListener("pointerdown", onPointerDown);
      canvas?.removeEventListener("pointerup", onPointerUp);
      canvas?.removeEventListener("pointercancel", onPointerUp);
      cancelAnimationFrame(raf);
    };
  }, [court, shoot]);

  // ── Authoritative shots from the server ──
  const shot = match.lastShot;
  useEffect(() => {
    if (!shot) return;
    const key = `${shot.playerId}:${shot.shotId ?? shot.serverTime}`;
    if (handledShotRef.current === key) return;
    handledShotRef.current = key;
    const label = shot.points > 0 ? `+${shot.points}${shot.multiplier && shot.multiplier > 1 ? `  ×${shot.multiplier}` : ""}` : null;
    if (shot.playerId === you) {
      if (shot.timeout) return;
      labelRef.current = label;
      const predicted = predictedRef.current;
      if (predicted && predicted.result.scored !== shot.scored) toast(shot.scored ? "Server call: it went in!" : "Server call: no good", "info");
      predictedRef.current = null;
      return;
    }
    const name = names[shot.playerId] ?? "Opponent";
    if (shot.timeout) {
      toast(`${name} ran out of time`, "warn");
      return;
    }
    if (start.mode === "shootout") {
      // Everyone watches the shooter's shot on their own court.
      const sim = toSim(shot);
      if (sim) {
        labelRef.current = label;
        gameRef.current?.playSim(sim);
      }
    } else if (shot.scored) {
      toast(`${name} ${label}${shot.swish ? " SWISH" : ""}`, "good");
    }
  }, [shot, you, names, start.mode, toast]);

  // ── HUD data ──
  const standings = useMemo(() => {
    const ids = start.order;
    const key = (id: string) => {
      const s = match.scores[id];
      if (!s) return [0, 0];
      return start.mode === "shootout" ? [s.forfeited ? -1 : 0, s.makes, s.points] : [s.forfeited ? -1 : 0, s.points, s.makes];
    };
    return [...ids].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      for (let i = 0; i < ka.length; i++) if (kb[i] !== ka[i]) return kb[i] - ka[i];
      return 0;
    });
  }, [match.scores, start.order, start.mode]);

  const secsLeft = (until: number | null | undefined) => (now === null || until == null ? null : Math.max(0, Math.ceil(until - now)));
  const countdown = now !== null && now < start.startAt ? Math.ceil(start.startAt - now) : null;
  const raceLeft = start.mode === "race" ? secsLeft(start.endsAt) : null;
  const turnLeft = turn ? secsLeft(turn.deadline) : null;
  const connected = (id: string) => room.players.find((p) => p.id === id)?.connected ?? false;

  let banner: { text: string; sub?: string; tone: string } | null = null;
  if (!match.result && started) {
    if (start.mode === "shootout" && turn) {
      banner =
        turn.playerId === you
          ? { text: "Your shot", sub: now !== null && now < turn.availableAt ? "Get set…" : `${turnLeft}s`, tone: "text-hoop" }
          : { text: `${names[turn.playerId] ?? "Opponent"} is shooting`, sub: `${turnLeft}s`, tone: "text-cream" };
    } else if (start.mode === "race" && !ended) {
      banner = { text: forfeited ? "You forfeited" : "Shoot!", tone: "text-hoop" };
    }
  }
  const coachOverride = !match.result && start.mode === "shootout" && turn && turn.playerId !== you ? { text: `${names[turn.playerId] ?? "Opponent"} is shooting…`, tone: "bg-white/15 text-cream" } : null;

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-ink text-cream select-none">
      <div ref={wrapRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block h-full w-full touch-none select-none" aria-label="Court. Press and hold to charge a shot, release to shoot." role="img" />
      </div>

      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Logo className="text-cream" />
          <span className="hidden rounded-full border border-cream/15 px-3 py-1 text-[11px] tracking-[0.14em] text-cream/70 uppercase md:inline">
            {room.code} · {start.mode === "shootout" ? "Shootout" : `Race ${start.raceSeconds}s`} · {difficulty.name}
          </span>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 text-center">
          {start.mode === "race" ? (
            <div className={`display text-6xl leading-none tabular-nums sm:text-7xl ${raceLeft !== null && raceLeft <= 10 ? "text-hoop" : ""}`}>
              {raceLeft === null ? "–" : `${Math.floor(raceLeft / 60)}:${String(raceLeft % 60).padStart(2, "0")}`}
            </div>
          ) : (
            <div className="display text-5xl leading-none sm:text-6xl">{turn?.suddenDeath ? "Sudden death" : `Round ${turn?.round ?? "–"}/${start.shootoutShots}`}</div>
          )}
        </div>
        <button type="button" onClick={onLeave} className="glass rounded-full px-4 py-2 text-xs font-semibold hover:bg-white/15">
          Leave
        </button>
      </header>

      {/* Scoreboard */}
      <ol className="glass absolute top-24 right-4 z-10 w-56 rounded-2xl p-2 sm:right-6 sm:w-64" aria-label="Scoreboard">
        {standings.map((id, i) => {
          const s = match.scores[id];
          const shooting = start.mode === "shootout" && turn?.playerId === id && !match.result;
          return (
            <li key={id} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm ${shooting ? "bg-hoop/25" : ""} ${s?.forfeited ? "opacity-40 line-through" : ""}`}>
              <span className="w-4 text-center font-mono text-xs text-cream/50">{i + 1}</span>
              <span className={`size-2 shrink-0 rounded-full ${connected(id) ? "bg-good" : "bg-warn"}`} />
              <span className="min-w-0 flex-1 truncate">
                {names[id] ?? "Player"}
                {id === you && <span className="ml-1 text-[10px] text-cream/50">(you)</span>}
              </span>
              <span className="font-mono tabular-nums">
                {start.mode === "shootout" ? `${s?.makes ?? 0}/${s?.shots ?? 0}` : (s?.points ?? 0)}
              </span>
            </li>
          );
        })}
        {difficulty.windMax > 0 && <li className="px-2 pt-1 font-mono text-[11px] text-sun">your wind {Math.abs(myWind).toFixed(1)} {myWind > 0 ? "→" : myWind < 0 ? "←" : "·"}</li>}
      </ol>

      {/* Turn banner */}
      {banner && (
        <div className="pointer-events-none absolute inset-x-0 top-[16%] z-10 text-center">
          <div className={`display text-4xl drop-shadow-lg sm:text-5xl ${banner.tone}`}>{banner.text}</div>
          {banner.sub && <div className="mt-1 font-mono text-lg text-cream/80">{banner.sub}</div>}
        </div>
      )}

      <CameraPip
        boxRef={pipBoxRef}
        videoRef={videoRef}
        pipRef={pipRef}
        camera={prefs.camera}
        cam={input.cam}
        tracker={input.tracker}
        detectorState={input.detectorState}
        motion={input.motion}
        thresholds={input.thresholds}
        coachOverride={coachOverride}
        onRetryCamera={input.retry}
        onRetryTracker={input.retryTracker}
      />
      <p className="absolute inset-x-0 bottom-3 z-10 hidden text-center text-[11px] text-cream/45 sm:block">
        Space or click: tap = medium · hold = charge · or throw on camera. The server referees every shot.
      </p>

      {/* Countdown */}
      {countdown !== null && countdown > 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
          <div key={countdown} className="display animate-count-pop text-[24vmin] leading-none text-cream drop-shadow-[0_8px_30px_rgba(0,0,0,.6)]">
            {countdown}
          </div>
        </div>
      )}

      {match.result && (
        <Results
          result={match.result}
          series={room.series}
          you={you}
          names={names}
          mode={start.mode}
          isHost={isHost}
          onRematch={() => send({ type: "rematch" })}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}

const bestOfName = (n: number) => `best-of-${n}`;

function Results({
  result,
  series,
  you,
  names,
  mode,
  isHost,
  onRematch,
  onLeave,
}: {
  result: NonNullable<MatchState["result"]>;
  series: Series;
  you: string;
  names: Record<string, string>;
  mode: "shootout" | "race";
  isHost: boolean;
  onRematch: () => void;
  onLeave: () => void;
}) {
  const youWon = result.winners.includes(you);
  const headline =
    result.reason === "aborted"
      ? "Match ended"
      : result.winners.length > 1
        ? youWon
          ? "Shared win!"
          : "It's a draw"
        : youWon
          ? "You win!"
          : `${names[result.winner ?? ""] ?? "Someone"} wins`;
  const why = { complete: "", time: "Buzzer!", forfeit: "By forfeit", aborted: "The host ended the match" }[result.reason];
  const inSeries = series.best_of > 1;
  const champ = series.winner;
  const myRow = result.standings.find((r) => r.playerId === you);
  const [shared, setShared] = useState<string | null>(null);

  const share = async () => {
    const others = result.standings.filter((r) => r.playerId !== you).map((r) => names[r.playerId] ?? "Player");
    const line = mode === "shootout" ? `${myRow?.makes ?? 0}/${myRow?.shots ?? 0} in a shootout` : `${myRow?.points ?? 0} pts in a race`;
    const outcome = youWon ? (result.winners.length > 1 ? "Tied" : "Won") : "Lost";
    const seriesLine = inSeries && champ ? (champ === you ? ` and took the ${bestOfName(series.best_of)} series` : "") : "";
    const r = await shareLink({
      title: "AirHoops result",
      text: `${outcome} ${line} vs ${others.join(", ") || "friends"}${seriesLine} on AirHoops 🏀 Think you can beat me?`,
      url: `${window.location.origin}/multiplayer`,
    });
    setShared(r === "shared" ? "Shared!" : r === "copied" ? "Copied to clipboard" : null);
  };

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-ink/70 p-4 backdrop-blur-sm" role="dialog" aria-label="Match results">
      <div className="w-full max-w-md rounded-3xl border border-cream/10 bg-ink/92 p-6 shadow-2xl sm:p-8">
        {why && <p className="text-xs tracking-[0.16em] text-hoop uppercase">{why}</p>}
        <h2 className={`display mt-2 text-5xl ${youWon ? "text-hoop" : ""}`}>{headline}</h2>
        {inSeries && (
          <p className={`mt-2 text-sm ${champ ? "font-semibold text-sun" : "text-cream/70"}`}>
            {champ
              ? `🏆 ${champ === you ? "You win" : `${names[champ] ?? "Someone"} wins`} the ${bestOfName(series.best_of)} series`
              : `${bestOfName(series.best_of)}: ${result.standings
                  .map((r) => `${r.playerId === you ? "You" : (names[r.playerId] ?? "Player")} ${series.wins[r.playerId] ?? 0}`)
                  .join(" · ")}`}
          </p>
        )}
        <ol className="mt-5 space-y-1.5">
          {result.standings.map((row) => (
            <li key={row.playerId} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${row.playerId === you ? "bg-white/[0.07]" : "bg-white/[0.03]"} ${row.forfeited ? "opacity-50" : ""}`}>
              <span className="w-5 font-mono text-sm text-cream/60">{row.rank === 1 && !row.forfeited ? "👑" : row.rank}</span>
              <span className="flex-1 truncate">
                {names[row.playerId] ?? "Player"}
                {row.forfeited && <span className="ml-1 text-xs text-warn">forfeit</span>}
              </span>
              <span className="font-mono text-sm tabular-nums">
                {mode === "shootout" ? `${row.makes}/${row.shots} · ` : ""}
                {row.points} pts
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-6 space-y-2">
          {isHost ? (
            <button type="button" onClick={onRematch} className="w-full rounded-full bg-hoop py-3 font-semibold hover:bg-hoop-soft">
              {inSeries && !champ ? `Next game (game ${series.games + 1})` : inSeries ? "New series" : "Rematch"}
            </button>
          ) : (
            <p className="rounded-full bg-white/5 py-3 text-center text-sm text-cream/70">
              Waiting for the host to start {inSeries && !champ ? "the next game" : "a rematch"}…
            </p>
          )}
          {result.reason !== "aborted" && (
            <button type="button" onClick={share} className="w-full rounded-full border border-cream/15 py-2.5 text-sm hover:border-cream/40" aria-live="polite">
              {shared ?? "Share result"}
            </button>
          )}
          <button type="button" onClick={onLeave} className="w-full rounded-full border border-cream/15 py-2.5 text-sm hover:border-cream/40">
            Leave room
          </button>
        </div>
      </div>
    </div>
  );
}
