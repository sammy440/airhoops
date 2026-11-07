"use client";

import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SkeletonOverlayHandle } from "@/components/lab/SkeletonOverlay";
import { CameraPip, useCourtInset } from "@/components/play/CameraPip";
import { Logo } from "@/components/ui/Logo";
import { ShareCardButton } from "@/components/ui/ShareCardButton";
import type { ChatLine, MatchState, Reaction } from "@/hooks/useRoom";
import { resultHeadline } from "./resultHeadline";
import { useCourtGestures, type ChargeControls } from "@/hooks/useCourtGestures";
import { useThrowInput } from "@/hooks/useThrowInput";
import { DEFAULT_AVATAR, loadProfile, sanitizeAvatar } from "@/lib/game/avatar";
import { courtThemeId, DEFAULT_COURT_THEME, type CourtThemeId } from "@/lib/game/courts";
import { calibratedLaunch, loadCalibration } from "@/lib/game/calibration";
import { courtFor, DIFFICULTIES, type DifficultyId } from "@/lib/game/difficulty";
import { AimCenter, leanAim, MAX_LEAN_AIM } from "@/lib/game/aim";
import { createGame, rendererId, type RendererId } from "@/lib/game/createGame";
import type { GameCore } from "@/lib/game/engine";
import { formatDuration } from "@/lib/game/modes";
import type { Launch, ShotSim } from "@/lib/game/physics";
import { setMuted, unlockAudio } from "@/lib/game/sfx";
import { keyboardThrow, throwAimFor, throwToLaunch } from "@/lib/game/shot";
import type { RoomState, Series } from "@/lib/net/api";
import { HORSE, SHOT_KIND_HOW, SHOT_KIND_NAMES, type ClientMessage, type MatchMode, type ServerShot } from "@/lib/net/socket";
import type { KinematicsFrame } from "@/lib/pose/kinematics";
import type { BounceEvent } from "@/lib/pose/dribbleDetector";
import type { ThrowEvent } from "@/lib/pose/throwDetector";
import type { ResultCardData } from "@/lib/resultCard";
import { siteUrl } from "@/lib/share";
import { LevelChip, XpSummary } from "@/components/ui/Level";
import { useProgress } from "@/hooks/useProgress";
import { ChatLauncher, typingInField } from "./Chat";
import { ReactionBar, ReactionBursts } from "./Reactions";

const TAP_MS = 180;
const FULL_CHARGE_MS = 1400;
const TAP_WOBBLE = 0.04;
const KEYBOARD_THROW = { angle: 30, arc: 0.7 }; // → 52° launch, same as solo keyboard

interface Props {
  room: RoomState;
  /** Your player id ("" when watching: you're in no standings and never shoot) */
  you: string;
  /** Watching, not playing: no camera, no chat or reactions to send */
  spectating?: boolean;
  match: MatchState;
  /** id → nickname for everyone seen in the room (incl. players who left) */
  names: Record<string, string>;
  isHost: boolean;
  serverNow: () => number | null;
  send: (m: ClientMessage) => void;
  toast: (text: string, tone?: "info" | "good" | "warn") => void;
  /** Reactions on screen right now (everyone's, yours included) */
  reactions: Reaction[];
  /** This room's chat (in memory only) and who you've muted */
  chat: ChatLine[];
  muted: ReadonlySet<string>;
  onToggleMute: (id: string) => void;
  onLeave: () => void;
}

/** Rebuilds a playable simulation from the server's authoritative shot. */
function toSim(shot: ServerShot): ShotSim | null {
  if (!shot.path || !shot.launch || shot.duration === undefined) return null;
  return {
    launch: shot.launch,
    path: shot.path,
    events: shot.events ?? [],
    result: { scored: shot.scored, swish: !!shot.swish, bank: !!shot.bank, miss: shot.miss ?? null, error: shot.error ?? 0, lateral: shot.lateral ?? 0 },
    duration: shot.duration,
    green: !!shot.green,
  };
}

const modeName = (mode: MatchMode, raceSeconds: number | null) =>
  mode === "shootout" ? "Shootout" : mode === "horse" ? "H-O-R-S-E" : `Race · ${formatDuration(raceSeconds ?? 60)}`;

/** H-O-R-S-E letters: the ones you've got lit, the rest dim. */
function Letters({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span className={`font-mono tracking-[0.2em] ${className}`} aria-label={n ? `Letters: ${HORSE.slice(0, n)}` : "No letters"}>
      {[...HORSE].map((c, i) => (
        <span key={i} className={i < n ? "text-hoop" : "text-cream/20"}>
          {c}
        </span>
      ))}
    </span>
  );
}

function loadPlayPrefs(): { camera: boolean; sound: boolean; courtTheme: CourtThemeId; renderer: RendererId } {
  try {
    const p = JSON.parse(localStorage.getItem("airhoops.play.prefs") ?? "{}");
    return { camera: p.camera ?? true, sound: p.sound ?? true, courtTheme: courtThemeId(p.courtTheme), renderer: rendererId(p.renderer) };
  } catch {
    return { camera: true, sound: true, courtTheme: DEFAULT_COURT_THEME, renderer: "3d" };
  }
}

export function MatchView({ room, you, spectating = false, match, names, isHost, serverNow, send, toast, reactions, chat, muted, onToggleMute, onLeave }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pipRef = useRef<SkeletonOverlayHandle>(null);
  const pipBoxRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GameCore | null>(null);
  const labelRef = useRef<string | null>(null);
  const predictedRef = useRef<ShotSim | null>(null);
  const handledShotRef = useRef<string | null>(null);

  const [prefs] = useState(() => (spectating ? { ...loadPlayPrefs(), camera: false } : loadPlayPrefs()));
  const [calibration] = useState(loadCalibration);
  // Aim by leaning (camera) or ←/→ (keyboard), as in solo play
  const [aimCenter] = useState(() => new AimCenter(calibration?.leanCenter ?? null));
  const [kbAim, setKbAim] = useState(0);
  const kbAimRef = useRef(0);
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
    const game = createGame(
      canvas,
      {
        onResult: () => {
          const label = labelRef.current;
          labelRef.current = null;
          return label ?? undefined;
        },
      },
      prefs.renderer,
    );
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
  }, [prefs.renderer]);
  useEffect(() => {
    gameRef.current?.setTheme(prefs.courtTheme);
  }, [prefs.courtTheme]);
  // The green rim, on the match clock like the server's (camera play only)
  const greenWindow = prefs.camera ? difficulty.greenWindow : null;
  useEffect(() => {
    gameRef.current?.setGreen(greenWindow);
  }, [greenWindow, prefs.renderer]);
  const progress = useProgress();
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
  /** Players take turns (shootout, H-O-R-S-E) rather than all shooting at once (race) */
  const turnBased = start.mode !== "race";
  const myTurn = start.mode === "race" || turn?.playerId === you;
  const turnOpen = start.mode === "race" || (turn !== null && now !== null && now >= turn.availableAt);
  const canShoot = started && !ended && !forfeited && myTurn && turnOpen;

  // ── Who's on the court: you, or (shootout) whoever's turn it is, in their own look ──
  const shooterId = turnBased && turn ? turn.playerId : you;
  const watching = shooterId !== you;
  const watchingRef = useRef(watching);
  // Your streak sets the ball alight (shown while it's you on court)
  const myStreak = match.scores[you]?.streak ?? 0;
  useEffect(() => {
    gameRef.current?.setStreak(watching ? 0 : myStreak);
  }, [myStreak, watching]);
  const shooterAvatar = room.players.find((p) => p.id === shooterId)?.avatar;
  // Whoever's shooting shoots their own ball and trail: yours from this device, theirs as the server
  // relays it (only what they've unlocked).
  const shooterLoadout = watching ? room.players.find((p) => p.id === shooterId)?.loadout : progress?.loadout;
  const loadoutKey = shooterLoadout ? `${shooterLoadout.ball}:${shooterLoadout.trail}` : watching ? "classic:flame" : null;
  useEffect(() => {
    if (!loadoutKey) return;
    const [ball, trail] = loadoutKey.split(":");
    gameRef.current?.setLoadout({ ball, trail });
  }, [loadoutKey, prefs.renderer]);
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
    (launch: Launch, payload: { power: number; angle: number; arc: number; aim: number }, camera = false) => {
      const game = gameRef.current;
      if (!game || !canShootRef.current || !game.canThrow()) return;
      const t = serverNow();
      // The prediction uses the same green rim as the server (both on the match clock); the server's call decides.
      const sim = game.throwBall(launch, camera);
      if (!sim || t === null) return;
      predictedRef.current = sim;
      send({ type: "throw", ...payload, t, camera });
    },
    [send, serverNow],
  );

  const onThrow = useCallback(
    (ev: ThrowEvent) => {
      // The server gets the same numbers and simulates the shot itself (aim included).
      const aim = throwAimFor(leanAim(ev.lean, aimCenter.value));
      aimCenter.observe(ev.lean);
      if (calibration) {
        const { launch, power } = calibratedLaunch({ ...ev, aim }, calibration, court, difficulty);
        shoot(launch, { power, angle: ev.angle, arc: ev.arc, aim }, true);
      } else {
        shoot(throwToLaunch({ ...ev, aim }), { power: ev.power, angle: ev.angle, arc: ev.arc, aim }, true);
      }
    },
    [calibration, court, difficulty, shoot, aimCenter],
  );
  const onPose = useCallback(
    (smoothed: NormalizedLandmark[] | undefined, kin: KinematicsFrame | null) => {
      if (!watchingRef.current) {
        gameRef.current?.setPose(smoothed);
        gameRef.current?.setAim(kin ? leanAim(kin.lean, aimCenter.value) : null);
      }
      pipRef.current?.draw(smoothed, { kin });
    },
    [aimCenter],
  );
  // Your dribbles show on court only while it's your player out there.
  const onBounce = useCallback((ev: BounceEvent) => {
    if (!watchingRef.current) gameRef.current?.bounce(ev.hand, ev.strength, ev.intervalMs);
  }, []);
  const input = useThrowInput(videoRef, { enabled: prefs.camera, onThrow, onBounce, onPose });
  useCourtInset(gameRef, pipBoxRef, prefs.camera);
  // Aim guide: the keyboard aim without a camera; nothing while watching someone else's turn.
  useEffect(() => {
    if (watching) gameRef.current?.setAim(null);
    else if (!prefs.camera) gameRef.current?.setAim(kbAim);
  }, [watching, prefs.camera, kbAim]);
  useEffect(() => {
    gameRef.current?.setLoaded(canShoot && input.tracker.status === "ready" && input.detectorState === "WINDUP");
  }, [canShoot, input.tracker.status, input.detectorState]);

  // Keyboard, mouse or touch: tap Space / the court = medium shot, hold = charge (a drag on the court looks around).
  const chargeRef = useRef<ChargeControls | null>(null);
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
      if (typingInField(e)) return; // typing a chat message: Space and arrows are text
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        e.preventDefault();
        const next = Math.min(MAX_LEAN_AIM, Math.max(-MAX_LEAN_AIM, kbAimRef.current + (e.code === "ArrowRight" ? 1 : -1)));
        kbAimRef.current = next;
        setKbAim(next);
        return;
      }
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
      const throwInput = { power, ...KEYBOARD_THROW, aim: throwAimFor(kbAimRef.current) };
      shoot(throwToLaunch(throwInput), throwInput);
    };
    const cancel = () => {
      downAt = null;
      cancelAnimationFrame(raf);
      gameRef.current?.setCharge(null);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || downAt === null) return;
      e.preventDefault();
      release();
    };
    chargeRef.current = { start: startCharge, release, cancel };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      chargeRef.current = null;
      cancelAnimationFrame(raf);
    };
  }, [court, shoot]);
  const [looked, setLooked] = useState(false);
  const onLooked = useCallback(() => setLooked(true), []);
  useCourtGestures(canvasRef, gameRef, chargeRef, onLooked, prefs.renderer);

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
    if (start.mode !== "race") {
      // Everyone watches the shooter's shot on their own court.
      const sim = toSim(shot);
      if (sim) {
        labelRef.current = label;
        gameRef.current?.playSim(sim);
      }
    } else if (shot.scored) {
      toast(`${name} ${label}${shot.swish ? " SWISH" : shot.bank ? " BANK" : ""}`, "good");
    }
  }, [shot, you, names, start.mode, toast]);

  // ── HUD data ──
  const standings = useMemo(() => {
    const ids = start.order;
    const key = (id: string) => {
      const s = match.scores[id];
      if (!s) return [0, 0];
      if (start.mode === "horse") return [s.forfeited ? -1 : 0, -(s.letters ?? 0), s.makes];
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
  // Clocks start when play does: through the countdown the race clock holds at its full length (the server's
  // end time includes the countdown), and a turn clock holds at its full length until the turn opens.
  const raceLeft = start.mode === "race" ? (countdown !== null ? (start.raceSeconds ?? null) : secsLeft(start.endsAt)) : null;
  const turnLeft = turn ? (now === null ? null : Math.max(0, Math.ceil(turn.deadline - Math.max(now, turn.availableAt)))) : null;
  const connected = (id: string) => room.players.find((p) => p.id === id)?.connected ?? false;

  let banner: { text: string; sub?: string; tone: string } | null = null;
  if (!match.result && started) {
    if (start.mode === "horse" && turn) {
      const name = names[turn.playerId] ?? "Opponent";
      const sub = now !== null && now < turn.availableAt ? "Get set…" : `${turnLeft}s`;
      const c = turn.challenge;
      banner =
        turn.playerId === you
          ? c
            ? { text: `Match the ${SHOT_KIND_NAMES[c]}`, sub: `${SHOT_KIND_HOW[c]} · ${sub}`, tone: "text-hoop" }
            : { text: "Set a shot", sub: `Make it and they have to match it · ${sub}`, tone: "text-hoop" }
          : c
            ? { text: `${name} must match the ${SHOT_KIND_NAMES[c]}`, sub, tone: "text-cream" }
            : { text: `${name} is setting`, sub, tone: "text-cream" };
    } else if (start.mode === "shootout" && turn) {
      banner =
        turn.playerId === you
          ? { text: "Your shot", sub: now !== null && now < turn.availableAt ? "Get set…" : `${turnLeft}s`, tone: "text-hoop" }
          : { text: `${names[turn.playerId] ?? "Opponent"} is shooting`, sub: `${turnLeft}s`, tone: "text-cream" };
    } else if (start.mode === "race" && !ended) {
      banner = { text: forfeited ? "You forfeited" : "Shoot!", tone: "text-hoop" };
    }
  }
  const coachOverride = !match.result && turnBased && turn && turn.playerId !== you ? { text: `${names[turn.playerId] ?? "Opponent"} is shooting…`, tone: "bg-white/15 text-cream" } : null;

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-ink text-cream select-none">
      <div ref={wrapRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block h-full w-full touch-none select-none" aria-label="Court. Press and hold to charge a shot, release to shoot." role="img" />
      </div>

      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Logo className="text-cream" />
          <span className="hidden rounded-full border border-cream/15 px-3 py-1 text-[11px] text-cream/70 md:inline">
            {room.code} · {modeName(start.mode, start.raceSeconds)} · {difficulty.name}
          </span>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 text-center">
          {start.mode === "race" ? (
            <div className={`display text-4xl leading-none tabular-nums sm:text-7xl ${raceLeft !== null && raceLeft <= 10 ? "text-hoop" : ""}`}>
              {raceLeft === null ? "–" : `${Math.floor(raceLeft / 60)}:${String(raceLeft % 60).padStart(2, "0")}`}
            </div>
          ) : start.mode === "horse" ? (
            <div className="display text-3xl leading-none sm:text-6xl">{turn?.challenge ? SHOT_KIND_NAMES[turn.challenge] : "Set"}</div>
          ) : (
            <div className="display text-3xl leading-none whitespace-nowrap sm:text-6xl">{turn?.suddenDeath ? "Sudden death" : `Round ${turn?.round ?? "–"}/${start.shootoutShots}`}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {looked && prefs.renderer === "3d" && (
            <button
              type="button"
              onClick={() => {
                gameRef.current?.resetView();
                setLooked(false);
              }}
              className="glass rounded-full px-4 py-2 text-xs font-semibold hover:bg-white/15"
            >
              Reset view
            </button>
          )}
          <button type="button" onClick={onLeave} className="glass rounded-full px-4 py-2 text-xs font-semibold hover:bg-white/15">
            Leave
          </button>
        </div>
      </header>

      {/* Scoreboard */}
      <ol className="glass absolute top-[4.25rem] right-3 z-10 w-44 rounded-2xl p-1.5 text-[13px] sm:top-24 sm:right-6 sm:w-64 sm:p-2 sm:text-sm" aria-label="Scoreboard">
        {standings.map((id, i) => {
          const s = match.scores[id];
          const shooting = turnBased && turn?.playerId === id && !match.result;
          const out = s?.forfeited || (start.mode === "horse" && (s?.letters ?? 0) >= HORSE.length);
          return (
            <li key={id} className={`flex items-center gap-1.5 rounded-xl px-1.5 py-1 sm:gap-2 sm:px-2 sm:py-1.5 ${shooting ? "bg-hoop/25" : ""} ${out ? "opacity-40 line-through" : ""}`}>
              <span className="w-4 text-center font-mono text-xs text-cream/50">{i + 1}</span>
              <span className={`size-2 shrink-0 rounded-full ${connected(id) ? "bg-good" : "bg-warn"}`} />
              <span className="min-w-0 flex-1 truncate">
                {names[id] ?? "Player"}
                {id === you && <span className="ml-1 text-[10px] text-cream/50">(you)</span>}
                {(() => {
                  const level = room.players.find((p) => p.id === id)?.level;
                  return level !== undefined ? <LevelChip level={level} className="ml-1" /> : null;
                })()}
                {start.mode === "horse" && turn?.setter === id && !match.result && <span className="ml-1 text-[10px] text-sun">sets</span>}
              </span>
              {start.mode === "horse" ? (
                <Letters n={s?.letters ?? 0} className="text-xs" />
              ) : (
                <span className="font-mono tabular-nums">{start.mode === "shootout" ? `${s?.makes ?? 0}/${s?.shots ?? 0}` : (s?.points ?? 0)}</span>
              )}
            </li>
          );
        })}
        {difficulty.windMax > 0 && <li className="px-2 pt-1 font-mono text-[11px] text-sun">your wind {Math.abs(myWind).toFixed(1)} {myWind > 0 ? "→" : myWind < 0 ? "←" : "·"}</li>}
      </ol>

      {/* Turn banner */}
      {banner && (
        <div className="pointer-events-none absolute inset-x-0 top-[34%] z-10 px-4 text-center sm:top-[16%]">
          <div className={`display text-3xl drop-shadow-lg sm:text-5xl ${banner.tone}`}>{banner.text}</div>
          {banner.sub && <div className="mt-1 font-mono text-base text-cream/80 sm:text-lg">{banner.sub}</div>}
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
        position="absolute bottom-24 left-3 z-10 w-40 sm:bottom-6 sm:left-6 sm:w-72 lg:w-80 xl:w-96"
        onRetryCamera={input.retry}
        onRetryTracker={input.retryTracker}
      />
      <p className="absolute inset-x-0 bottom-3 z-10 hidden text-center text-[11px] text-cream/45 sm:block">
        Space or click: tap = medium · hold = charge · ←→ aim · {prefs.renderer === "3d" ? "drag to look around · " : ""}1–6 react · or throw on camera (lean to aim).
        The server referees every shot.
      </p>

      {/* Chat: a bubble with an unread count; opens over the court (and the results). Watchers only see the court. */}
      {!spectating && <ChatLauncher
        placement="match"
        chat={chat}
        names={names}
        you={you}
        opponents={room.players.filter((p) => p.id !== you).map((p) => ({ id: p.id, nickname: p.nickname }))}
        quickOnly={!!room.quick}
        muted={muted}
        onToggleMute={onToggleMute}
        send={send}
        toast={toast}
      />}

      {/* Reactions: above the results too, for a "GG" */}
      {!spectating && <ReactionBar send={send} keys className="absolute right-4 bottom-10 z-[35] sm:right-6" />}
      <ReactionBursts reactions={reactions} names={names} you={you} />

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
          players={room.players}
          courtTheme={prefs.courtTheme}
          context={`${modeName(start.mode, start.raceSeconds)} · ${difficulty.name}`}
          you={you}
          names={names}
          mode={start.mode}
          xp={match.xp ?? null}
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
  players,
  courtTheme,
  context,
  you,
  names,
  mode,
  xp,
  isHost,
  onRematch,
  onLeave,
}: {
  result: NonNullable<MatchState["result"]>;
  series: Series;
  players: RoomState["players"];
  courtTheme: CourtThemeId;
  context: string;
  you: string;
  names: Record<string, string>;
  mode: MatchMode;
  xp: { before: number; after: number } | null;
  isHost: boolean;
  onRematch: () => void;
  onLeave: () => void;
}) {
  const youWon = result.winners.includes(you);
  const played = result.standings.some((r) => r.playerId === you);
  const headline = resultHeadline(result, you, names);
  const why = { complete: "", time: "Buzzer!", forfeit: "By forfeit", aborted: "The host ended the match" }[result.reason];
  const inSeries = series.best_of > 1;
  const champ = series.winner;
  const myRow = result.standings.find((r) => r.playerId === you);
  const site = siteUrl();
  const card: ResultCardData = {
    context: inSeries ? `${context} · Best of ${series.best_of}` : context,
    headline,
    badge:
      inSeries && champ === you
        ? `Won the best-of-${series.best_of} series`
        : inSeries && !champ
          ? `Series ${series.wins[you] ?? 0}–${Math.max(0, ...result.standings.filter((r) => r.playerId !== you).map((r) => series.wins[r.playerId] ?? 0))}`
          : undefined,
    // Rooms seat four at most, so everyone fits on the card.
    players: result.standings.slice(0, 4).map((r) => ({
        name: names[r.playerId] ?? "Player",
        avatar: sanitizeAvatar(players.find((p) => p.id === r.playerId)?.avatar ?? DEFAULT_AVATAR),
        score: mode === "horse" ? HORSE.slice(0, r.letters ?? 0) || "–" : String(mode === "shootout" ? r.makes : r.points),
        you: r.playerId === you,
        winner: result.winners.includes(r.playerId),
      })),
    stats: myRow
      ? [
          mode === "horse"
            ? ["Letters", HORSE.slice(0, myRow.letters ?? 0) || "None"]
            : [mode === "shootout" ? "Points" : "Makes", mode === "shootout" ? String(myRow.points) : `${myRow.makes}/${myRow.shots}`],
          ["Accuracy", `${myRow.shots ? Math.round((myRow.makes / myRow.shots) * 100) : 0}%`],
          ["Swishes", String(myRow.swishes)],
        ]
      : [],
    theme: courtTheme,
    url: site,
  };
  const shareText = `${youWon ? "Won" : "Played"} a ${mode === "horse" ? "game of H-O-R-S-E" : mode} on AirHoops 🏀 Think you can beat me? ${site}/multiplayer`;

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-ink/70 p-4 backdrop-blur-sm" role="dialog" aria-label="Match results">
      <div className="w-full max-w-md rounded-3xl border border-cream/10 bg-ink/92 p-6 shadow-2xl sm:p-8">
        {why && <p className="text-xs text-hoop">{why}</p>}
        <h2 className={`display mt-2 text-5xl ${youWon ? "text-hoop" : ""}`}>{headline}</h2>
        {inSeries && (
          <p className={`mt-2 text-sm ${champ ? "font-semibold text-sun" : "text-cream/70"}`}>
            {champ
              ? champ === you
                ? `🏆 You win the ${bestOfName(series.best_of)} series`
                : played
                  ? `You lost the ${bestOfName(series.best_of)} series`
                  : `🏆 ${names[champ] ?? "Someone"} wins the ${bestOfName(series.best_of)} series`
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
              {mode === "horse" ? (
                <Letters n={row.letters ?? 0} className="text-sm" />
              ) : (
                <span className="font-mono text-sm tabular-nums">
                  {mode === "shootout" ? `${row.makes}/${row.shots} · ` : ""}
                  {row.points} pts
                </span>
              )}
            </li>
          ))}
        </ol>
        {xp && <XpSummary before={xp.before} after={xp.after} className="mt-4" />}
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
          {result.reason !== "aborted" && <ShareCardButton card={card} filename="airhoops-result.png" text={shareText} />}
          <button type="button" onClick={onLeave} className="w-full rounded-full border border-cream/15 py-2.5 text-sm hover:border-cream/40">
            Leave room
          </button>
        </div>
      </div>
    </div>
  );
}
