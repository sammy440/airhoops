"use client";

import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SkeletonOverlayHandle } from "@/components/lab/SkeletonOverlay";
import { Camera01Icon, CameraOff01Icon, Film01Icon, PauseIcon, RepeatIcon, VolumeHighIcon, VolumeOffIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Logo } from "@/components/ui/Logo";
import { useLighting } from "@/hooks/useLighting";
import { useCourtGestures, type ChargeControls } from "@/hooks/useCourtGestures";
import { useThrowInput } from "@/hooks/useThrowInput";
import { beep } from "@/lib/browser";
import {
  calibrate,
  calibratedLaunch,
  CALIBRATION_THROWS,
  isOutlier,
  loadCalibration,
  saveCalibration,
  type Calibration,
  type PracticeThrow,
} from "@/lib/game/calibration";
import { loadProfile } from "@/lib/game/avatar";
import { courtThemeId, DEFAULT_COURT_THEME, type CourtThemeId } from "@/lib/game/courts";
import { dailyRandom, dailyRules } from "@/lib/game/daily";
import { courtFor, DIFFICULTIES, rollWind, type DifficultyId } from "@/lib/game/difficulty";
import { AimCenter, leanAim, MAX_LEAN_AIM } from "@/lib/game/aim";
import { createGame, rendererId, type RendererId } from "@/lib/game/createGame";
import type { GameCore } from "@/lib/game/engine";
import { GhostPlayer, loadGhost, saveGhost, type GhostShot } from "@/lib/game/ghostRun";
import { unlockedBetween } from "@/lib/game/cosmetics";
import { loadProgress, recordPlay, shownXp, syncProgress } from "@/lib/game/progress";
import { levelFor } from "@/lib/game/xp";
import { useProgress } from "@/hooks/useProgress";
import { untilGreen } from "@/lib/game/green";
import { ClipRecorder } from "@/lib/clips/clipRecorder";
import { drawClipOverlay } from "@/lib/clips/overlay";
import { siteUrl } from "@/lib/share";
import { HOT_BOUNCES, HotHand } from "@/lib/game/hotHand";
import {
  bestKey,
  clampTimedSeconds,
  DEFAULT_TIMED_SECONDS,
  formatDuration,
  loadBests,
  modeWithClock,
  recordBest,
  type ModeId,
} from "@/lib/game/modes";
import type { Launch, ShotSim } from "@/lib/game/physics";
import { addShot, EMPTY_TALLY, hotMultiplier, streakMultiplier, type Tally } from "@/lib/game/scoring";
import { setMuted, unlockAudio } from "@/lib/game/sfx";
import { coachShot, DEFAULT_TUNING, keyboardThrow, throwAimFor, throwToLaunch } from "@/lib/game/shot";
import type { KinematicsFrame, Side } from "@/lib/pose/kinematics";
import type { BounceEvent } from "@/lib/pose/dribbleDetector";
import type { ThrowEvent } from "@/lib/pose/throwDetector";
import { CameraPip, useCourtInset } from "./CameraPip";
import type { RunSubmission } from "@/lib/net/api";
import { RaiseHandHint } from "./RaiseHandHint";
import { CalibrationPanel, ClipDialog, GameOver, PauseMenu, SetupCheck, StartMenu, type ClipState } from "./Screens";
import { ShotGauge, type LastShot } from "./ShotGauge";

const PREFS_KEY = "airhoops.play.prefs";
const TAP_MS = 180;
const FULL_CHARGE_MS = 1400;
const TAP_WOBBLE = 0.04;
const COUNTDOWN_STEP_MS = 700;
const SLOW_FPS = 15;

type Screen = "menu" | "setup" | "calibrate" | "countdown" | "playing" | "over";

interface Prefs {
  camera: boolean;
  sound: boolean;
  seenIntro: boolean;
  mode: ModeId;
  difficulty: DifficultyId;
  timedSeconds: number;
  /** Cosmetic court scenery; multiplayer reads it from here too. */
  courtTheme: CourtThemeId;
  /** 3D court or the classic 2D side view; multiplayer reads it from here too. */
  renderer: RendererId;
  /** Passed the camera setup check before; next time it's skipped if they're already in position. */
  setupPassed: boolean;
  /** Slow-motion replays of great makes (3D). */
  replays: boolean;
  /** Seen the one-time "swipe to look around" tip (3D on phones). */
  seenLookTip: boolean;
  /** Race a ghost of your best run in timed and daily runs. */
  ghost: boolean;
  /** Keep the last few seconds of play, ready to save as a clip; and whether your camera is in them (off unless you choose). */
  clips: boolean;
  clipCamera: boolean;
}
const DEFAULT_PREFS: Prefs = {
  camera: true,
  sound: true,
  seenIntro: false,
  mode: "free",
  difficulty: "starter",
  timedSeconds: DEFAULT_TIMED_SECONDS,
  courtTheme: DEFAULT_COURT_THEME,
  renderer: "3d",
  setupPassed: false,
  replays: true,
  seenLookTip: false,
  ghost: true,
  clips: true,
  clipCamera: false,
};

/** Stand-in until the clock can be read on the client (the page is prerendered). Never shown: the menu waits for hydration. */
const BEFORE_DAILY = dailyRules(new Date(0));

interface PendingShot {
  power: number;
  angle: number;
  aim: number;
  input: LastShot["input"];
  wind: number;
  phase: number;
  /** Thrown with a hot hand */
  hot: boolean;
  /** Run time (s) at launch, for the ghost */
  at: number;
}

export function PlayClient() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pipRef = useRef<SkeletonOverlayHandle>(null);
  const pipBoxRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GameCore | null>(null);
  const pendingRef = useRef<PendingShot | null>(null);

  // ── Preferences ──
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [hydrated, setHydrated] = useState(false);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [bests, setBests] = useState<ReturnType<typeof loadBests>>({});
  useEffect(() => {
    try {
      const stored = { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage
      setPrefs({
        ...stored,
        timedSeconds: clampTimedSeconds(stored.timedSeconds),
        courtTheme: courtThemeId(stored.courtTheme),
        renderer: rendererId(stored.renderer),
      });
    } catch {}
    setCalibration(loadCalibration());
    setBests(loadBests());
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {}
    setMuted(!prefs.sound);
  }, [prefs, hydrated]);
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v }));

  // Daily mode plays today's rules (loaded after mount, refreshed whenever the menu opens) instead of the player's picks.
  const [daily, setDaily] = useState(BEFORE_DAILY);
  const isDaily = prefs.mode === "daily";
  const difficultyId = isDaily ? daily.difficulty : prefs.difficulty;
  const difficulty = DIFFICULTIES[difficultyId];
  const mode = useMemo(
    () => modeWithClock(prefs.mode, isDaily ? daily.seconds : prefs.timedSeconds),
    [prefs.mode, isDaily, daily.seconds, prefs.timedSeconds],
  );
  const court = useMemo(() => courtFor(difficulty), [difficulty]);

  // ── Flow state ──
  const [screen, setScreen] = useState<Screen>("menu");
  const [paused, setPaused] = useState(false);
  const [tally, setTally] = useState<Tally>(EMPTY_TALLY);
  const tallyRef = useRef<Tally>(EMPTY_TALLY);
  const [last, setLast] = useState<LastShot | null>(null);
  const [kbAngle, setKbAngle] = useState(DEFAULT_TUNING.baseAngle);
  /** Keyboard aim, launch degrees (+ = right) */
  const [kbAim, setKbAim] = useState(0);
  /** Camera aim from your lean, whole degrees (+ = right), for the readout */
  const [leanShown, setLeanShown] = useState<number | null>(null);
  const leanShownRef = useRef<number | null>(null);
  // Camera aim: lean relative to the player's straight lean (calibrated, else learned from their throws)
  const [aimCenter] = useState(() => new AimCenter());
  useEffect(() => {
    aimCenter.setCalibrated(calibration?.leanCenter ?? null);
  }, [aimCenter, calibration]);
  const [wind, setWind] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [newBest, setNewBest] = useState(false);
  const [run, setRun] = useState<(RunSubmission & { id: number }) | null>(null);
  const [calSamples, setCalSamples] = useState<PracticeThrow[]>([]);
  const [calOutlier, setCalOutlier] = useState(false);
  const [calHand, setCalHand] = useState<Side>("right");
  const calReturnRef = useRef<"menu" | "play">("menu");
  const setupPassedRef = useRef(false);
  const calSkippedRef = useRef(false);
  const endsAtRef = useRef<number | null>(null);
  // Ghost of your best run: when the run started (game clock at "GO!", s), this run's shots, and the ghost being
  // raced. Timed from GO because the countdown runs on wall time: on a struggling device the game clock covers less.
  const runStartRef = useRef(0);
  const runShotsRef = useRef<GhostShot[]>([]);
  const rivalRef = useRef<GhostPlayer | null>(null);
  const [rivalPoints, setRivalPoints] = useState<number | null>(null);
  // XP: what you had when the run started (for "+N XP" at the end), and a level-up shown mid-run
  const runXpRef = useRef(0);
  const [runXp, setRunXp] = useState<{ before: number; after: number } | null>(null);
  const [levelUp, setLevelUp] = useState<{ level: number; unlocks: string[] } | null>(null);
  const progress = useProgress();
  // Clips: a recorder per engine (null when off or the browser can't encode video), the clip being shown,
  // and what the clip's overlay needs each frame
  const recorderRef = useRef<ClipRecorder | null>(null);
  const [clipsOn, setClipsOn] = useState(false);
  const [clip, setClip] = useState<ClipState | null>(null);
  const clipPausedRef = useRef(false);
  const clipHudRef = useRef({ label: "", suddenDeath: false, camera: false });
  const loadoutKey = progress ? `${progress.loadout.ball}:${progress.loadout.trail}` : null;
  const buzzerRef = useRef(false);
  const screenRef = useRef(screen);
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  const pause = useCallback((p: boolean) => {
    setPaused(p);
    gameRef.current?.setPaused(p);
  }, []);

  const endGame = useCallback(() => {
    const t = tallyRef.current;
    const isBest = recordBest(prefs.mode, difficultyId, { points: t.points, makes: t.makes, streak: t.best }, prefs.timedSeconds, daily.key);
    setNewBest(isBest);
    // Finishing a run on the clock (or a streak) earns XP; the daily earns its bonus once.
    if (prefs.mode !== "free") recordPlay({ runs: 1, daily: prefs.mode === "daily" ? daily.key : null });
    setRunXp({ before: runXpRef.current, after: shownXp(loadProgress()) });
    void syncProgress();
    // A new best on the clock becomes the ghost to race next time.
    if (isBest && (prefs.mode === "timed" || prefs.mode === "daily")) {
      saveGhost(bestKey(prefs.mode, difficultyId, prefs.timedSeconds, daily.key), { points: t.points, shots: runShotsRef.current });
    }
    // Free play has no clock or end condition, so it has no leaderboard.
    setRun(
      prefs.mode === "free"
        ? null
        : {
            id: Date.now(),
            mode: prefs.mode === "daily" ? daily.key : prefs.mode === "timed" ? `timed${prefs.timedSeconds}` : "streak",
            difficulty: difficultyId,
            score: prefs.mode === "streak" ? t.best : t.points,
            shots: t.shots,
            makes: t.makes,
          },
    );
    setBests(loadBests());
    setScreen("over");
  }, [prefs.mode, difficultyId, prefs.timedSeconds, daily.key]);

  // ── Game engine (created once; callbacks read the latest state through refs) ──
  // Hot hand: dribble in rhythm, then shoot (solo only; the server scores multiplayer).
  const [hotHand] = useState(() => new HotHand());
  const [hotBounces, setHotBounces] = useState(0);

  const handlers = useRef<{ onResult: (sim: ShotSim) => string | void; onReady: () => void }>({
    onResult: () => undefined,
    onReady: () => {},
  });
  /** Caption of the instant replay on screen, if any */
  const [replay, setReplay] = useState<string | null>(null);
  // What a freshly created engine needs to catch up on (the effects below only push changes).
  const sceneRef = useRef({ court, theme: prefs.courtTheme, wind: 0, replays: prefs.replays });
  useEffect(() => {
    sceneRef.current = { court, theme: prefs.courtTheme, wind, replays: prefs.replays };
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !hydrated) return;
    const game = createGame(
      canvas,
      {
        onResult: (sim) => handlers.current.onResult(sim),
        onReady: () => handlers.current.onReady(),
        onReplay: setReplay,
      },
      prefs.renderer,
    );
    const scene = sceneRef.current;
    game.setReplays(scene.replays);
    game.setAvatar(loadProfile().avatar);
    game.setCourt(scene.court);
    game.setTheme(scene.theme);
    game.setWind(scene.wind);
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
  }, [hydrated, prefs.renderer]);

  // Wind lives in state; the engine just mirrors it. Daily runs draw shot n's wind from today's seed.
  const nextWind = useCallback(
    (d = difficulty) => setWind(rollWind(d, isDaily ? dailyRandom(daily, tallyRef.current.shots) : Math.random)),
    [difficulty, isDaily, daily],
  );
  useEffect(() => {
    gameRef.current?.setWind(wind);
  }, [wind]);
  useEffect(() => {
    gameRef.current?.setCourt(court);
  }, [court]);
  useEffect(() => {
    gameRef.current?.setTheme(prefs.courtTheme);
  }, [prefs.courtTheme]);
  useEffect(() => {
    gameRef.current?.setReplays(prefs.replays);
  }, [prefs.replays]);
  // The green rim: on camera play, a throw while the rim is green swishes (shorter windows on harder levels)
  const greenWindow = prefs.camera ? difficulty.greenWindow : null;
  useEffect(() => {
    gameRef.current?.setGreen(greenWindow);
  }, [greenWindow, prefs.renderer, hydrated]);

  // Clips: record while a run is on (and not paused), straight after each frame is drawn
  useEffect(() => {
    const game = gameRef.current;
    const canvas = canvasRef.current;
    if (!hydrated || !prefs.clips || !game || !canvas) return;
    let rec: ClipRecorder | null = null;
    let gone = false;
    void ClipRecorder.create(canvas.width, canvas.height, prefs.camera ? "lite" : "full").then((r) => {
      if (gone) return r?.close();
      rec = r;
      recorderRef.current = r;
      setClipsOn(!!r);
    });
    game.setFrameListener(() => {
      if (!rec || screenRef.current !== "playing" || game.paused) return;
      const hud = clipHudRef.current;
      const t = tallyRef.current;
      rec.capture(canvas, (ctx, w, h) =>
        drawClipOverlay(ctx, w, h, {
          score: String(hud.suddenDeath ? t.streak : t.points),
          label: hud.label,
          camera: hud.camera ? videoRef.current : null,
          site: siteUrl().replace(/^https?:\/\//, ""),
        }),
      );
    });
    return () => {
      gone = true;
      game.setFrameListener(null);
      rec?.close();
      recorderRef.current = null;
      setClipsOn(false);
    };
  }, [hydrated, prefs.clips, prefs.renderer, prefs.camera]);

  // Unlocked ball skin and trail (after the engine exists: this runs after the effect that creates it)
  useEffect(() => {
    if (!loadoutKey) return;
    const [ball, trail] = loadoutKey.split(":");
    gameRef.current?.setLoadout({ ball, trail });
  }, [loadoutKey, prefs.renderer, hydrated]);
  const changeDifficulty = (d: DifficultyId) => {
    set("difficulty", d);
    nextWind(DIFFICULTIES[d]);
  };

  useEffect(() => {
    handlers.current.onResult = (sim) => {
      const p = pendingRef.current;
      const { tally: t, score } = addShot(tallyRef.current, sim.result, difficulty.scoreMultiplier, p?.hot);
      tallyRef.current = t;
      setTally(t);
      gameRef.current?.setStreak(t.streak);
      if (p) {
        const l = sim.launch;
        const r = sim.result;
        const xp = recordPlay({ shots: 1, makes: r.scored ? 1 : 0, swishes: r.swish ? 1 : 0, banks: r.bank ? 1 : 0, bestStreak: t.streak });
        const [was, now] = [levelFor(xp.before), levelFor(xp.after)];
        if (now > was) {
          setLevelUp({ level: now, unlocks: unlockedBetween(was, now) });
          window.setTimeout(() => setLevelUp(null), 4000);
        }
        // Free play has no end: send play every couple of dozen shots
        if (loadProgress().pending.shots >= 25) void syncProgress();
        runShotsRef.current.push({ t: p.at, speed: l.speed, angle: l.angle, aim: l.aim ?? 0, wind: p.wind, phase: p.phase, points: score.points });
        const coach = coachShot(sim.launch, court, DEFAULT_TUNING, { wind: p.wind, phase: p.phase });
        setLast({
          power: p.power,
          angle: p.angle,
          aim: p.aim,
          input: p.input,
          result: sim.result,
          window: coach.window,
          aimTarget: coach.aimTarget,
          aimTolerance: coach.aimTolerance,
        });
      }
      if (screenRef.current === "playing") {
        if (mode.suddenDeath && !sim.result.scored) window.setTimeout(endGame, 1300);
        else if (buzzerRef.current) window.setTimeout(endGame, 900);
      }
      if (!score.points) return;
      return `+${score.points}${score.multiplier > 1 ? `  ×${score.multiplier}` : ""}${score.hot ? "  HOT" : ""}`;
    };
    handlers.current.onReady = () => nextWind();
  }, [difficulty, court, mode, endGame, nextWind]);

  const shoot = useCallback((launch: Launch, power: number, input: LastShot["input"]) => {
    const game = gameRef.current;
    if (screenRef.current !== "playing" || buzzerRef.current || !game) return false;
    // During a replay: a camera throw cuts it short and still shoots (it can't be thrown again);
    // keys and taps just skip it, and the ball is back in hand a moment later.
    if (game.replaying) {
      if (input !== "camera") {
        game.skipReplay();
        return false;
      }
      game.skipReplay(true);
    }
    const phase = game.hoopPhase;
    const w = wind;
    if (!game.throwBall(launch, input === "camera")) return false;
    const hot = hotHand.shoot(performance.now());
    setHotBounces(0);
    game.setHot(false);
    pendingRef.current = { power, angle: launch.angle, aim: launch.aim ?? 0, input, wind: w, phase, hot, at: game.clock - runStartRef.current };
    return true;
  }, [wind, hotHand]);

  // ── Camera input ──
  const onThrow = useCallback(
    (ev: ThrowEvent) => {
      const s = screenRef.current;
      if (s === "calibrate") {
        setCalSamples((prev) => {
          if (prev.length >= CALIBRATION_THROWS) return prev;
          setCalOutlier(isOutlier(prev.map((s) => s.speed), ev.armSpeed));
          setCalHand(ev.hand);
          beep(880 + prev.length * 220, 140);
          return [...prev, { speed: ev.armSpeed, jump: ev.jump, lean: ev.lean }];
        });
        return;
      }
      if (s !== "playing") return;
      // Aim: how far they leaned at release, as the throw's sideways angle
      const thrown = { ...ev, aim: throwAimFor(leanAim(ev.lean, aimCenter.value)) };
      aimCenter.observe(ev.lean);
      if (calibration) {
        const { launch, power } = calibratedLaunch(thrown, calibration, court, difficulty);
        shoot(launch, power, "camera");
      } else {
        shoot(throwToLaunch(thrown), ev.power, "camera");
      }
    },
    [calibration, court, difficulty, shoot, aimCenter],
  );
  const onPose = useCallback(
    (smoothed: NormalizedLandmark[] | undefined, kin: KinematicsFrame | null) => {
      const game = gameRef.current;
      game?.setPose(smoothed);
      // The guide shows where a throw right now would go, and so does the readout (whole degrees, only on change).
      const aim = kin ? leanAim(kin.lean, aimCenter.value) : null;
      game?.setAim(aim);
      const shown = aim === null ? null : Math.round(aim);
      if (shown !== leanShownRef.current) {
        leanShownRef.current = shown;
        setLeanShown(shown);
      }
      pipRef.current?.draw(smoothed, { kin });
    },
    [aimCenter],
  );
  const onBounce = useCallback(
    (ev: BounceEvent) => {
      const game = gameRef.current;
      game?.bounce(ev.hand, ev.strength, ev.intervalMs);
      if (screenRef.current !== "playing" || game?.paused) return;
      hotHand.bounce(ev);
      setHotBounces(hotHand.bounces(ev.t));
      game?.setHot(hotHand.isHot(ev.t));
    },
    [hotHand],
  );
  // The hot hand cools off a few seconds after the last bounce.
  useEffect(() => {
    if (screen !== "playing" || hotBounces === 0) return;
    const id = window.setInterval(() => {
      const t = performance.now();
      setHotBounces(hotHand.bounces(t));
      gameRef.current?.setHot(hotHand.isHot(t));
    }, 250);
    return () => window.clearInterval(id);
  }, [screen, hotBounces, hotHand]);
  // What a raised hand does on the current screen (set below, once the flow functions exist).
  const raiseRunRef = useRef<{ action: RaiseAction; run: () => void } | null>(null);
  const onRaiseHand = useCallback(() => {
    const current = raiseRunRef.current;
    if (!current) return;
    beep(1046, 120);
    current.run();
  }, []);
  const { cam, tracker, stats, detectorState, motion, raiseHand, resetRaiseHand, thresholds, retry, retryTracker } = useThrowInput(videoRef, {
    enabled: hydrated && prefs.camera,
    onThrow,
    onBounce,
    onRaiseHand,
    onPose,
  });
  const tracking = tracker.status === "ready";
  const lighting = useLighting(videoRef, prefs.camera && screen === "setup");

  useEffect(() => {
    gameRef.current?.setLoaded(tracking && detectorState === "WINDUP");
    // Ball up to shoot during a replay: the replay gets out of the way
    if (tracking && detectorState === "WINDUP" && gameRef.current?.replaying) gameRef.current.skipReplay(true);
  }, [tracking, detectorState]);
  useEffect(() => {
    if (!prefs.camera) gameRef.current?.setPose(undefined);
  }, [prefs.camera]);

  // Slow-tracking warning: sustained < 15 fps for 5 s.
  const [slow, setSlow] = useState(false);
  const fpsRef = useRef(0);
  useEffect(() => {
    fpsRef.current = stats.fps;
  }, [stats.fps]);
  useEffect(() => {
    if (!tracking) return;
    let slowFor = 0;
    const id = window.setInterval(() => {
      const fps = fpsRef.current;
      slowFor = fps > 0 && fps < SLOW_FPS ? slowFor + 1 : 0;
      setSlow(slowFor >= 5);
    }, 1000);
    return () => window.clearInterval(id);
  }, [tracking]);

  useCourtInset(gameRef, pipBoxRef, prefs.camera, prefs.renderer);

  // ── Flow ──
  const startRun = useCallback(() => {
    gameRef.current?.skipReplay();
    recorderRef.current?.reset();
    runXpRef.current = shownXp(loadProgress());
    setRunXp(null);
    tallyRef.current = EMPTY_TALLY;
    setTally(EMPTY_TALLY);
    hotHand.reset();
    setHotBounces(0);
    gameRef.current?.setHot(false);
    gameRef.current?.setStreak(0);
    setLast(null);
    setNewBest(false);
    buzzerRef.current = false;
    endsAtRef.current = null;
    setTimeLeft(mode.seconds ?? null);
    nextWind();
    const game = gameRef.current;
    game?.setCourt(court);
    runShotsRef.current = [];
    // The moving hoop starts from the same spot every run (its clock starts with the countdown): the same for
    // everyone on the daily, and the same as your ghost's run.
    if (game) {
      const start = game.clock;
      game.setPhaseSource(() => game.clock - start);
      const ghost = mode.seconds && prefs.ghost ? loadGhost(bestKey(prefs.mode, difficultyId, prefs.timedSeconds, daily.key)) : null;
      rivalRef.current = ghost && new GhostPlayer(ghost, court);
      game.setRival(null); // until GO
    }
    setRivalPoints(rivalRef.current ? 0 : null);
    pause(false);
    setCountdown(3);
    setScreen("countdown");
  }, [mode, court, pause, nextWind, hotHand, prefs.ghost, prefs.mode, prefs.timedSeconds, difficultyId, daily.key]);

  // A returning player who's already standing in a good spot goes straight to the countdown.
  const inPosition = prefs.setupPassed && tracking && stats.framing === null && stats.confidence >= 0.6;
  const proceed = useCallback(() => {
    // Remember we're heading into a game, so setup → calibration → game flows through.
    calReturnRef.current = "play";
    if (prefs.camera && !setupPassedRef.current && !inPosition) return setScreen("setup");
    if (prefs.camera && !calibration && !calSkippedRef.current) {
      calReturnRef.current = "play";
      setCalSamples([]);
      return setScreen("calibrate");
    }
    startRun();
  }, [prefs.camera, calibration, startRun, inPosition]);

  const begin = () => {
    unlockAudio();
    set("seenIntro", true);
    proceed();
  };

  const openCalibration = (returnTo: "menu" | "play") => {
    unlockAudio();
    calReturnRef.current = returnTo;
    setCalSamples([]);
    setCalOutlier(false);
    pause(false);
    setScreen(prefs.camera && !setupPassedRef.current ? "setup" : "calibrate");
  };

  const afterSetup = (passed: boolean) => {
    setupPassedRef.current = true;
    if (passed) set("setupPassed", true);
    if (prefs.camera && (!calibration || calReturnRef.current === "menu") && !calSkippedRef.current) {
      setScreen("calibrate");
    } else {
      startRun();
    }
  };

  const saveCalibrationAndGo = () => {
    if (calResult) {
      saveCalibration(calResult);
      setCalibration(calResult);
    }
    if (calReturnRef.current === "play") startRun();
    else setScreen("menu");
  };

  // ── Raise a hand to press the main button, so nobody has to walk back to the keyboard. Not during a run:
  //    the set point ("hold it high, pause") looks too much like it. ──
  const calResult = calSamples.length >= CALIBRATION_THROWS ? calibrate(calSamples, calHand) : null;
  const inRun = screen === "playing" || screen === "countdown";
  let raiseAction: RaiseAction | null = null;
  if (prefs.camera && tracking) {
    if (paused && inRun) raiseAction = "resume";
    else if (hydrated && screen === "menu") raiseAction = "start";
    else if (screen === "calibrate" && calResult) raiseAction = "save";
    else if (screen === "over") raiseAction = "again";
  }
  useEffect(() => {
    const runs: Record<RaiseAction, () => void> = {
      resume: () => pause(false),
      start: begin,
      save: saveCalibrationAndGo,
      again: startRun,
    };
    raiseRunRef.current = raiseAction && { action: raiseAction, run: runs[raiseAction] };
  });
  // Each new screen needs the hands down first: the arm still up from the last shot can't press it.
  const hasCalResult = calResult !== null;
  useEffect(() => {
    resetRaiseHand();
  }, [screen, paused, hasCalResult, resetRaiseHand]);

  // The ghost only races during a run.
  useEffect(() => {
    if (screen !== "playing" && screen !== "countdown") gameRef.current?.setRival(null);
  }, [screen]);

  // A new day's challenge shows up the next time the menu opens.
  useEffect(() => {
    if (screen !== "menu") return;
    const today = dailyRules();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- only changes at midnight UTC
    setDaily((d) => (d.key === today.key ? d : today));
  }, [screen]);

  // Countdown → playing
  useEffect(() => {
    if (screen !== "countdown" || paused) return;
    const id = window.setTimeout(() => {
      if (countdown > 0) {
        beep(countdown === 1 ? 880 : 660, 120);
        setCountdown(countdown - 1);
      } else {
        const game = gameRef.current;
        const now = game?.clock ?? 0;
        if (mode.seconds) endsAtRef.current = now + mode.seconds;
        runStartRef.current = now;
        game?.setRival(rivalRef.current, now);
        setScreen("playing");
      }
    }, COUNTDOWN_STEP_MS);
    return () => window.clearTimeout(id);
  }, [screen, countdown, paused, mode.seconds]);

  // Shot clock (uses the pause-aware game clock).
  useEffect(() => {
    if (screen !== "playing" || !mode.seconds) return;
    const id = window.setInterval(() => {
      const game = gameRef.current;
      if (!game || endsAtRef.current === null) return;
      const left = Math.max(0, endsAtRef.current - game.clock);
      setTimeLeft(left);
      if (rivalRef.current) setRivalPoints(rivalRef.current.pointsAt(game.clock - runStartRef.current));
      if (left <= 0 && !buzzerRef.current) {
        buzzerRef.current = true;
        beep(220, 700, 0.25);
        // A ball already in the air still counts (buzzer beater); otherwise end now.
        if (!game.ballInFlight) endGame();
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [screen, mode.seconds, endGame]);

  // Auto-pause when the tab is hidden (performance + fairness).
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && (screenRef.current === "playing" || screenRef.current === "countdown")) pause(true);
      if (document.hidden) void syncProgress();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pause]);

  useEffect(() => {
    clipHudRef.current = {
      label: `${mode.suddenDeath ? "in a row" : "points"} · ${mode.name}${mode.seconds ? ` ${formatDuration(mode.seconds)}` : ""}`,
      suddenDeath: !!mode.suddenDeath,
      camera: prefs.camera && prefs.clipCamera,
    };
  }, [mode, prefs.camera, prefs.clipCamera]);

  /** Freeze the game and pack the last seconds into a clip. */
  const saveClip = useCallback(async () => {
    const rec = recorderRef.current;
    const game = gameRef.current;
    if (!rec || !game) return;
    clipPausedRef.current = !game.paused;
    game.setPaused(true);
    setClip({ status: "making" });
    const blob = await rec.save().catch(() => null);
    setClip(blob ? { status: "ready", blob, url: URL.createObjectURL(blob) } : { status: "empty" });
  }, []);
  const closeClip = () => {
    if (clip?.status === "ready") URL.revokeObjectURL(clip.url);
    setClip(null);
    if (clipPausedRef.current) gameRef.current?.setPaused(false);
    clipPausedRef.current = false;
  };
  const saveClipRef = useRef(saveClip);
  useEffect(() => {
    saveClipRef.current = saveClip;
  }, [saveClip]);

  // ── Keyboard / mouse / touch: Space or press-and-hold on the court shoots (tap = medium, hold = charge),
  //    ↑/↓ arc, ←/→ aim, Esc/P pause ──
  const kbAngleRef = useRef(kbAngle);
  const kbAimRef = useRef(kbAim);
  /** Shot charging, for mouse / touch on the court (useCourtGestures) */
  const chargeRef = useRef<ChargeControls | null>(null);
  useEffect(() => {
    kbAngleRef.current = kbAngle;
    kbAimRef.current = kbAim;
  }, [kbAngle, kbAim]);
  // Without the camera the guide shows the keyboard aim (with it, the lean drives it in onPose).
  useEffect(() => {
    if (!prefs.camera) gameRef.current?.setAim(kbAim);
  }, [prefs.camera, kbAim, prefs.renderer]);
  useEffect(() => {
    let downAt: number | null = null;
    let raf = 0;
    const tick = () => {
      if (downAt === null) return;
      gameRef.current?.setCharge(Math.min(1, (performance.now() - downAt) / FULL_CHARGE_MS));
      raf = requestAnimationFrame(tick);
    };
    const playing = () => screenRef.current === "playing";
    const onDown = (e: KeyboardEvent) => {
      if (e.code === "Escape" || e.code === "KeyP") {
        if (playing() || screenRef.current === "countdown") {
          e.preventDefault();
          pause(!gameRef.current?.paused);
        }
        return;
      }
      if (e.code === "KeyC" && !e.repeat && recorderRef.current && (playing() || screenRef.current === "over") && !gameRef.current?.paused) {
        void saveClipRef.current();
        return;
      }
      if (!playing() || gameRef.current?.paused) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) startCharge();
      } else if (e.code === "ArrowUp" || e.code === "ArrowDown") {
        e.preventDefault();
        setKbAngle((a) => Math.min(DEFAULT_TUNING.maxAngle, Math.max(DEFAULT_TUNING.minAngle, a + (e.code === "ArrowUp" ? 2 : -2))));
      } else if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        e.preventDefault();
        setKbAim((a) => Math.min(MAX_LEAN_AIM, Math.max(-MAX_LEAN_AIM, a + (e.code === "ArrowRight" ? 1 : -1))));
      }
    };
    const startCharge = () => {
      // Space, a click or a tap during a replay skips it.
      if (playing() && gameRef.current?.replaying) {
        gameRef.current.skipReplay();
        return false;
      }
      if (downAt !== null || !playing() || !gameRef.current?.canThrow()) return false;
      downAt = performance.now();
      raf = requestAnimationFrame(tick);
      return true;
    };
    const release = () => {
      if (downAt === null) return;
      const held = performance.now() - downAt;
      downAt = null;
      cancelAnimationFrame(raf);
      gameRef.current?.setCharge(null);
      // Tap = a medium shot with a little human wobble, so keyboard play isn't a guaranteed swish.
      const power =
        held < TAP_MS
          ? keyboardThrow(undefined, gameRef.current?.court).power + (Math.random() * 2 - 1) * TAP_WOBBLE
          : Math.min(1, held / FULL_CHARGE_MS);
      const t = DEFAULT_TUNING;
      shoot({ speed: t.minSpeed + power * (t.maxSpeed - t.minSpeed), angle: kbAngleRef.current, aim: kbAimRef.current }, power, "keys");
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
    // Mouse / touch on the court (useCourtGestures): a press charges, a drag looks around instead.
    chargeRef.current = { start: startCharge, release, cancel };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      chargeRef.current = null;
      cancelAnimationFrame(raf);
    };
  }, [shoot, pause]);

  // Drag / swipe to look around the 3D court, wheel / pinch to zoom
  const [looked, setLooked] = useState(false);
  const onLooked = useCallback(() => setLooked(true), []);
  // Phones hide the hint line, so the first 3D run there shows a one-time tip instead.
  const [lookTip, setLookTip] = useState(false);
  useEffect(() => {
    if (screen !== "playing" || prefs.renderer !== "3d" || prefs.seenLookTip) return;
    if (!matchMedia("(pointer: coarse)").matches && innerWidth >= 640) return;
    const show = window.setTimeout(() => setLookTip(true), 1500);
    const hide = window.setTimeout(() => {
      setLookTip(false);
      setPrefs((p) => ({ ...p, seenLookTip: true }));
    }, 8000);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [screen, prefs.renderer, prefs.seenLookTip]);
  useEffect(() => {
    if (!looked || !lookTip) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- they found it: the tip has done its job
    setLookTip(false);
    setPrefs((p) => ({ ...p, seenLookTip: true }));
  }, [looked, lookTip]);
  useCourtGestures(canvasRef, gameRef, chargeRef, onLooked, prefs.renderer);
  const resetView = () => {
    gameRef.current?.resetView();
    setLooked(false);
  };

  // ── Render ──
  const accuracy = tally.shots ? Math.round((tally.makes / tally.shots) * 100) : 0;
  const mult = streakMultiplier(tally.streak);
  const best = bests[bestKey(prefs.mode, difficultyId, prefs.timedSeconds, daily.key)];
  const clockSecs = timeLeft === null ? 0 : Math.ceil(timeLeft);

  return (
    <div id="main" className="fixed inset-0 overflow-hidden bg-ink text-cream select-none">
      <div ref={wrapRef} className="absolute inset-0">
        <canvas
          key={prefs.renderer}
          ref={canvasRef}
          className="block h-full w-full touch-none select-none"
          aria-label="Court. Press and hold to charge a shot, release to shoot."
          role="img"
        />
      </div>

      {/* ── Top HUD ── */}
      <header className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Logo className="text-cream" />
          <span className="hidden rounded-full border border-white/20 bg-black/30 px-3 py-1 text-[11px] text-cream/80 backdrop-blur-md md:inline">
            {mode.name}
            {mode.seconds ? ` ${formatDuration(mode.seconds)}` : ""} · {difficulty.name}
          </span>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 text-center">
          {mode.seconds && timeLeft !== null && inRun ? (
            <div className={`font-mono text-sm tabular-nums ${timeLeft <= 10 ? "text-hoop-soft" : "text-cream/70"}`}>
              {Math.floor(clockSecs / 60)}:{String(clockSecs % 60).padStart(2, "0")}
            </div>
          ) : null}
          <div key={tally.points} className="display animate-count-pop text-6xl leading-none sm:text-7xl">
            {mode.suddenDeath ? tally.streak : tally.points}
          </div>
          <div className="mt-1 text-[11px] text-cream/65">
            {mode.suddenDeath ? "in a row" : "points"}
            {mult > 1 && <span className="ml-2 rounded-full bg-hoop px-1.5 py-0.5 font-bold text-cream">×{mult}</span>}
            {!mode.suddenDeath && tally.streak >= 2 && <span className="ml-2 text-sun">🔥 {tally.streak}</span>}
          </div>
          {rivalPoints !== null && inRun && (
            <div className="mt-1 text-[11px] text-cream/55" title="Your best run, flown beside you as the see-through ball">
              vs best{" "}
              <b className={`font-mono tabular-nums ${tally.points > rivalPoints ? "text-good" : tally.points < rivalPoints ? "text-hoop-soft" : "text-cream/75"}`}>
                {tally.points > rivalPoints ? `+${tally.points - rivalPoints}` : tally.points < rivalPoints ? `−${rivalPoints - tally.points}` : "level"}
              </b>
            </div>
          )}
          {/* Streak mode scores the streak itself, so there's nothing to heat up. */}
          {screen === "playing" && !mode.suddenDeath && hotBounces > 0 && (
            <div
              className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${hotBounces >= HOT_BOUNCES ? "animate-count-pop bg-hoop text-cream" : "glass text-cream/75"}`}
              aria-live="polite"
            >
              {hotBounces >= HOT_BOUNCES ? (
                <>Hot hand · next make ×{hotMultiplier(tally.streak)}</>
              ) : (
                <>
                  Heating up
                  {Array.from({ length: HOT_BOUNCES }, (_, i) => (
                    <span key={i} className={`size-1.5 rounded-full ${i < hotBounces ? "bg-sun" : "bg-cream/20"}`} aria-hidden />
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="glass hidden rounded-2xl px-3 py-1.5 text-right font-mono text-xs tabular-nums sm:block">
            <div>
              {tally.makes}/{tally.shots} · {accuracy}%
            </div>
            {difficulty.windMax > 0 ? (
              <div className="text-sun">
                wind {Math.abs(wind).toFixed(1)} {wind > 0 ? "→" : wind < 0 ? "←" : "·"}
              </div>
            ) : (
              <div className="text-cream/50">best streak {tally.best}</div>
            )}
          </div>
          <HudButton label={prefs.sound ? "Mute" : "Unmute"} on={prefs.sound} onClick={() => set("sound", !prefs.sound)} icon={prefs.sound ? VolumeHighIcon : VolumeOffIcon} />
          {clipsOn && inRun && (
            <HudButton label="Save a clip of the last 8 seconds (C)" on onClick={() => void saveClip()} icon={Film01Icon} />
          )}
          {looked && prefs.renderer === "3d" && (
            <HudButton label="Reset view" on onClick={resetView} icon={RepeatIcon} />
          )}
          <HudButton
            label={prefs.camera ? "Camera off (keyboard only)" : "Camera on"}
            on={prefs.camera}
            onClick={() => set("camera", !prefs.camera)}
            icon={prefs.camera ? Camera01Icon : CameraOff01Icon}
          />
          {inRun && (
            <HudButton label="Pause (Esc)" on onClick={() => pause(true)} icon={PauseIcon} />
          )}
        </div>
      </header>

      {/* ── Camera picture-in-picture ── */}
      <CameraPip
        boxRef={pipBoxRef}
        videoRef={videoRef}
        pipRef={pipRef}
        camera={prefs.camera}
        cam={cam}
        tracker={tracker}
        detectorState={detectorState}
        motion={motion}
        thresholds={thresholds}
        slowFps={slow ? stats.fps : null}
        onRetryCamera={retry}
        onRetryTracker={retryTracker}
      />

      <p className="pointer-events-none absolute inset-x-0 top-[46%] z-0 text-center text-[11px] text-cream/40 sm:hidden [@media(orientation:landscape)]:hidden">
        Rotate your phone for the best view ↻
      </p>

      {/* ── Shot feedback ── */}
      <div className="absolute inset-x-0 bottom-4 z-10 flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:pr-6 xl:items-center xl:pr-4">
        {last && screen === "playing" && !replay && <ShotGauge shot={last} />}
        {greenWindow !== null && screen === "playing" && !replay && <GreenCue gameRef={gameRef} window={greenWindow} />}
        {prefs.camera && screen === "playing" && !replay && leanShown !== null && (
          <p className="glass rounded-full px-3 py-1 font-mono text-[11px] text-cream/80 tabular-nums" aria-live="off">
            Lean aim: {leanShown === 0 ? "straight" : `${Math.abs(leanShown)}° ${leanShown > 0 ? "right →" : "← left"}`}
          </p>
        )}
        {screen === "playing" && !replay && (
          <p className="hidden text-[11px] text-cream/45 sm:block">
            Space or click: tap = medium · hold = charge · ↑↓ arc {kbAngle}° · ←→ aim {kbAim > 0 ? `${kbAim}° R` : kbAim < 0 ? `${-kbAim}° L` : "straight"} ·{" "}
            {prefs.renderer === "3d" ? "drag to look around · " : ""}Esc pause
          </p>
        )}
      </div>

      {/* ── Instant replay: letterbox and caption; a tap, Space or a throw skips it ── */}
      {replay && screen === "playing" && (
        <div className="pointer-events-none absolute inset-0 z-[5]" aria-live="polite">
          <div className="animate-letterbox absolute inset-x-0 top-0 h-[9vh] origin-top bg-ink/85" />
          <div className="animate-letterbox absolute inset-x-0 bottom-0 grid h-[9vh] origin-bottom place-items-center bg-ink/85">
            <p className="text-[11px] text-cream/60">
              <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-hoop align-middle" aria-hidden />
              Instant replay · <span className="font-semibold text-sun">{replay}</span>
              <span className="hidden sm:inline"> · tap or Space to skip</span>
            </p>
          </div>
        </div>
      )}

      {levelUp && inRun && (
        <div className="animate-count-pop pointer-events-none absolute inset-x-0 top-[30%] z-10 flex justify-center px-4" aria-live="polite">
          <div className="rounded-2xl bg-hoop px-5 py-2.5 text-center text-cream shadow-xl">
            <div className="display text-3xl leading-none">Level {levelUp.level}!</div>
            {levelUp.unlocks.length > 0 && <div className="mt-1 text-xs font-semibold">Unlocked: {levelUp.unlocks.join(", ")}</div>}
          </div>
        </div>
      )}

      {lookTip && screen === "playing" && !replay && (
        <div className="animate-count-pop pointer-events-none absolute inset-x-0 top-[38%] z-10 flex justify-center px-4">
          <p className="glass rounded-full px-4 py-2 text-sm text-cream">👆 Swipe to look around · pinch to zoom</p>
        </div>
      )}

      {/* ── Countdown ── */}
      {screen === "countdown" && !paused && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
          <div key={countdown} className="display animate-count-pop text-[24vmin] leading-none text-cream drop-shadow-[0_8px_30px_rgba(0,0,0,.6)]">
            {countdown > 0 ? countdown : "GO!"}
          </div>
        </div>
      )}

      {/* ── Screens ── */}
      {hydrated && screen === "menu" && (
        <StartMenu
          firstTime={!prefs.seenIntro}
          mode={prefs.mode}
          difficulty={prefs.difficulty}
          timedSeconds={prefs.timedSeconds}
          daily={daily}
          courtTheme={prefs.courtTheme}
          renderer={prefs.renderer}
          onRenderer={(r) => set("renderer", r)}
          replays={prefs.replays}
          onReplays={(on) => set("replays", on)}
          ghost={prefs.ghost}
          onGhost={(on) => set("ghost", on)}
          clips={{ record: prefs.clips, camera: prefs.clipCamera }}
          onClips={(c) => setPrefs((p) => ({ ...p, clips: c.record, clipCamera: c.camera }))}
          calibration={calibration}
          camera={prefs.camera}
          best={best}
          xp={progress?.xp ?? null}
          onMode={(m) => set("mode", m)}
          onCourtTheme={(t) => set("courtTheme", t)}
          onTimedSeconds={(s) => set("timedSeconds", s)}
          onDifficulty={changeDifficulty}
          onCalibrate={() => openCalibration("menu")}
          onStart={begin}
        />
      )}
      {screen === "setup" && (
        <SetupCheck
          cameraLive={cam.status === "live"}
          tracking={tracking}
          framing={stats.framing}
          confidence={stats.confidence}
          lighting={lighting.status}
          onContinue={() => afterSetup(true)}
          onSkip={() => afterSetup(false)}
        />
      )}
      {screen === "calibrate" && (
        <CalibrationPanel
          samples={calSamples.map((s) => s.speed)}
          outlier={calOutlier}
          loaded={tracking && detectorState === "WINDUP"}
          result={calResult}
          onRedo={() => {
            setCalSamples((s) => s.slice(0, -1));
            setCalOutlier(false);
          }}
          onSave={saveCalibrationAndGo}
          onSkip={() => {
            calSkippedRef.current = true;
            if (calReturnRef.current === "play") startRun();
            else setScreen("menu");
          }}
        />
      )}
      {paused && inRun && (
        <PauseMenu
          sound={prefs.sound}
          camera={prefs.camera}
          onResume={() => pause(false)}
          onRestart={startRun}
          onRecalibrate={() => openCalibration("play")}
          onMenu={() => {
            pause(false);
            setScreen("menu");
          }}
          onSound={() => set("sound", !prefs.sound)}
          onCamera={() => set("camera", !prefs.camera)}
        />
      )}
      {screen === "over" && (
        <GameOver
          mode={prefs.mode}
          difficulty={difficultyId}
          seconds={mode.seconds}
          daily={daily}
          tally={tally}
          newBest={newBest}
          best={best}
          run={run}
          courtTheme={prefs.courtTheme}
          xp={runXp}
          onClip={clipsOn ? () => void saveClip() : undefined}
          onAgain={startRun}
          onMenu={() => setScreen("menu")}
        />
      )}

      {clip && <ClipDialog clip={clip} onClose={closeClip} />}

      {raiseAction && <RaiseHandHint label={RAISE_LABELS[raiseAction]} state={raiseHand} />}
    </div>
  );
}

type RaiseAction = "resume" | "start" | "save" | "again";

const RAISE_LABELS: Record<RaiseAction, string> = {
  resume: "Resume",
  start: "Start",
  save: "Save & continue",
  again: "Play again",
};

function HudButton({ label, on, onClick, icon }: { label: string; on: boolean; onClick: () => void; icon: IconSvgElement }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid size-10 place-items-center rounded-full border border-white/15 bg-black/35 text-cream backdrop-blur-md transition hover:bg-black/55 ${on ? "" : "opacity-55"}`}
    >
      <HugeiconsIcon icon={icon} size={18} strokeWidth={1.8} />
    </button>
  );
}

/**
 * "Green rim in 1.2s" / "Rim is green: shoot now!". Its own component with its own 10 Hz tick, so
 * the rest of the screen doesn't re-render with it (the camera pipeline shares the main thread).
 */
function GreenCue({ gameRef, window: greenWindow }: { gameRef: React.RefObject<GameCore | null>; window: number }) {
  const [cue, setCue] = useState<number | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      const game = gameRef.current;
      // Tenths of a second until green (0 = green now); null while the ball's away
      const next = game?.canThrow() ? Math.ceil(untilGreen(game.hoopPhase, greenWindow) * 10) / 10 : null;
      setCue((c) => (c === next ? c : next));
    }, 100);
    return () => window.clearInterval(id);
  }, [gameRef, greenWindow]);
  if (cue === null) return null;
  return (
    <p className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${cue === 0 ? "bg-[#3dff7a] text-ink" : "glass text-cream/75"}`} aria-live="off">
      {cue === 0 ? "● Rim is green: shoot now!" : `Green rim in ${cue.toFixed(1)}s`}
    </p>
  );
}
