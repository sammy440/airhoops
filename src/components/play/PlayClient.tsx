"use client";

import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SkeletonOverlayHandle } from "@/components/lab/SkeletonOverlay";
import { Logo } from "@/components/ui/Logo";
import { useLighting } from "@/hooks/useLighting";
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
import { CalibrationPanel, GameOver, PauseMenu, SetupCheck, StartMenu } from "./Screens";
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
    setNewBest(recordBest(prefs.mode, difficultyId, { points: t.points, makes: t.makes, streak: t.best }, prefs.timedSeconds, daily.key));
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
  // What a freshly created engine needs to catch up on (the effects below only push changes).
  const sceneRef = useRef({ court, theme: prefs.courtTheme, wind: 0 });
  useEffect(() => {
    sceneRef.current = { court, theme: prefs.courtTheme, wind };
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
      },
      prefs.renderer,
    );
    const scene = sceneRef.current;
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
    const phase = game.hoopPhase;
    const w = wind;
    if (!game.throwBall(launch)) return false;
    const hot = hotHand.shoot(performance.now());
    setHotBounces(0);
    game.setHot(false);
    pendingRef.current = { power, angle: launch.angle, aim: launch.aim ?? 0, input, wind: w, phase, hot };
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
      // The guide shows where a throw right now would go.
      game?.setAim(kin ? leanAim(kin.lean, aimCenter.value) : null);
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
    // Daily: the moving hoop starts from the same spot for everyone (its clock starts with the countdown).
    if (game) {
      const start = game.clock;
      game.setPhaseSource(isDaily ? () => game.clock - start : null);
    }
    pause(false);
    setCountdown(3);
    setScreen("countdown");
  }, [mode, court, pause, nextWind, isDaily, hotHand]);

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
        if (mode.seconds) endsAtRef.current = (gameRef.current?.clock ?? 0) + mode.seconds;
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
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pause]);

  // ── Keyboard / mouse / touch: Space or press-and-hold on the court shoots (tap = medium, hold = charge),
  //    ↑/↓ arc, ←/→ aim, Esc/P pause ──
  const kbAngleRef = useRef(kbAngle);
  const kbAimRef = useRef(kbAim);
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
      if (downAt !== null || !gameRef.current?.canThrow()) return false;
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
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || downAt === null) return;
      e.preventDefault();
      release();
    };
    // Mouse / touch on the court itself (buttons and dialogs sit above it, so they never trigger a shot).
    const canvas = canvasRef.current;
    let pointer: number | null = null;
    const onPointerDown = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0 || !playing() || gameRef.current?.paused) return;
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
  }, [shoot, pause]);

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
          <span className="hidden rounded-full border border-cream/15 px-3 py-1 text-[11px] tracking-[0.14em] text-cream/70 uppercase md:inline">
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
          <div className="mt-1 text-[11px] tracking-[0.16em] text-cream/60 uppercase">
            {mode.suddenDeath ? "in a row" : "points"}
            {mult > 1 && <span className="ml-2 rounded-full bg-sun px-1.5 py-0.5 font-bold text-ink">×{mult}</span>}
            {!mode.suddenDeath && tally.streak >= 2 && <span className="ml-2 text-sun">🔥 {tally.streak}</span>}
          </div>
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
          <div className="glass hidden rounded-xl px-3 py-1.5 text-right font-mono text-xs tabular-nums sm:block">
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
          <IconButton label={prefs.sound ? "Mute" : "Unmute"} on={prefs.sound} onClick={() => set("sound", !prefs.sound)}>
            {prefs.sound ? <path d="M4 9v6h4l5 4V5L8 9H4zm12 .5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" /> : <path d="M4 9v6h4l5 4V5L8 9H4zm12 1 5 5m0-5-5 5" />}
          </IconButton>
          <IconButton label={prefs.camera ? "Camera off (keyboard only)" : "Camera on"} on={prefs.camera} onClick={() => set("camera", !prefs.camera)}>
            <path d="M4 7h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
            {!prefs.camera && <path d="M3 3l18 18" />}
          </IconButton>
          {inRun && (
            <IconButton label="Pause (Esc)" on onClick={() => pause(true)}>
              <path d="M9 5v14M15 5v14" />
            </IconButton>
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
        {last && screen === "playing" && <ShotGauge shot={last} />}
        {screen === "playing" && (
          <p className="hidden text-[11px] text-cream/45 sm:block">
            Space or click: tap = medium · hold = charge · ↑↓ arc {kbAngle}° · ←→ aim {kbAim > 0 ? `${kbAim}° R` : kbAim < 0 ? `${-kbAim}° L` : "straight"} · Esc pause
          </p>
        )}
      </div>

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
          calibration={calibration}
          camera={prefs.camera}
          best={best}
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
          onAgain={startRun}
          onMenu={() => setScreen("menu")}
        />
      )}

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

function IconButton({ label, on, onClick, children }: { label: string; on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`glass grid size-9 place-items-center rounded-full transition hover:bg-white/15 ${on ? "" : "opacity-60"}`}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}
