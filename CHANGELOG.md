# Changelog

Every tuned threshold is recorded here with the reason, as the project README asks.

## Week 8 — Leaderboards, accessibility, privacy, launch prep
- `/leaderboard`: solo (timed 30 s–2 min + any custom length via link, streak) and multiplayer (shootout, race)
  boards; today / this week / all time; difficulty filter; avatars; ties share a rank; your personal bests + rank.
- Game Over posts timed and streak runs with `shots`/`makes` so the server can reject impossible scores, then shows
  your rank. Automatic once you have a guest pass; otherwise a one-tap opt-in (creates the pass from your profile).
  Free play has no leaderboard (no end condition).
- Mouse/touch shooting in Play and matches: press and hold the court to charge, release to shoot (same as Space).
- Camera problems in Play now say what's wrong (blocked, busy, missing, needs HTTPS) and how to play without it.
- Accessibility: skip link, `id="main"` on every page, global `:focus-visible` ring, extra reduced-motion rules,
  low-contrast small text raised. axe-core audit of every route: no critical issues. Still open: cream on the
  brand red (#ea3a1d) is 3.6:1, below AA for small text.
- `/privacy`: what stays on the device, what's stored online, and "Delete my online data" (`DELETE /auth/me`).
- Monitoring: uncaught errors + error boundaries (`error.tsx`, `global-error.tsx`) report to `/telemetry/errors`
  in production (max 5 per page load, de-duplicated). New `not-found.tsx`.
- `next.config.ts`: security headers (`Permissions-Policy: camera=(self)`, HSTS, nosniff, frame deny), 1-week
  cache for `/mediapipe` assets. `prebuild` fetches the pose models so Vercel serves them from the site.
- Nav: Play · Multiplayer · Leaderboard | Lab · Your player · Privacy.

## Player profile & avatar
- `/profile` ("Your player"): name, body (male/female), 8 skin tones, 6 hair styles + colour, jersey colour
  and number, shorts and sneaker colours (every colour also has a custom picker), Ready/Shooting preview,
  randomize, reset. Stored on this device (`airhoops.profile`); synced to the server for multiplayer guests.
- `drawPlayer.ts`: the player renderer, shared by the game, the profile preview and `AvatarCanvas` badges.
- Play draws your look; the start menu shows it with an "Edit look" link.
- Multiplayer: nickname is prefilled from the profile, lobby cards show each player's avatar, edits made while
  in a room appear for everyone right away, and in a shootout the court shows whoever is shooting, in their look.
- Avatars from other players are always passed through `sanitizeAvatar` before drawing (server validates too).

## Week 7 — Multiplayer matches
- Backend referees every shot (see backend README). `src/lib/game/parity.gen.test.ts` exports physics
  fixtures for the Python port: run with `GEN_PARITY=1` after touching physics, mapping, difficulty or scoring.
- `RoomSocket`: clock sync (Cristian's algorithm on pongs, best-RTT sample) → `serverNow()`; new message types.
- `useRoom`: match state (start, scoreboard, turn, last shot, result, forfeits); remembers departed players' names.
- `Game`: `setPhaseSource()` (moving hoop follows the server's match clock), `playSim()` (animate a server shot),
  time-based path lookup (server paths are 60 Hz).
- `MatchView`: full-screen match: instant local prediction + server verdict, opponent shot replays (shootout),
  scoreboard, turn banner + shot clock, race timer, synced countdown, results + rematch.
- `/multiplayer` lobby: Shootout / Race (30 s – 2 min) + difficulty.
- `CameraPip`: camera preview shared by `/play` and matches.

## Week 6 — Multiplayer foundations
- New backend repo `airhoops-backend` (FastAPI, SQLModel, Alembic, Postgres). See its README.
- `lib/net/api.ts`: REST client + guest session on-device; `lib/net/socket.ts`: room socket with 10 s
  heartbeat + RTT, exponential-backoff reconnects, fatal-close handling; `hooks/useRoom.ts`.
- `/multiplayer`: nickname → create room (mode, difficulty) or join by code / invite link → live lobby
  with presence dots, ready-up, host start/end/rematch, presence toasts (sub-1.5 s blips stay silent).
- Env: `NEXT_PUBLIC_API_URL` (+ optional `NEXT_PUBLIC_WS_URL`), see `.env.local.example`.

## Week 5.2 — Custom shot clock
- Timed mode gets a **Custom** option: 1–30 whole minutes via −/+ or typing; stored values are sanitised.

## Week 5.1 — Timed mode durations
- "60 Seconds" is now **Timed** with a shot-clock picker: 30 s, 1 min, 90 s, 2 min (remembered).
- Personal bests are kept per duration; old 60-second bests migrate to the 1-minute slot.
- Fixed the clock display at minute boundaries (119.5 s showed 1:00; now 2:00).

## Week 5 — Calibration, scoring, difficulty, modes, polish

### Added
- **Calibration** (`lib/game/calibration.ts`): 3 practice throws → average/min/max peak wrist speed,
  saved on-device. A calibrated player's *average* throw launches at the ideal speed for the current hoop;
  throwing harder/softer than your own average goes long/short. Outlier practice throws are flagged for a redo.
- **Scoring** (`lib/game/scoring.ts`): 2 points, +1 swish, streak multiplier ×1.5 from 3 in a row, ×2 from 5,
  ×3 from 10; harder difficulties multiply points. Floating text shows the real points ("+6 ×2").
- **Difficulty** (`lib/game/difficulty.ts`): Rookie / Starter / All-Star / Legend: distance, rim size,
  a sliding hoop, per-shot wind (with a pennant on the pole and a HUD readout), calibration sensitivity.
- **Physics**: moving hoop and wind as explicit, deterministic inputs (`ShotConditions`), so a server can
  replay the exact shot.
- **Modes** (`lib/game/modes.ts`): Free Play, 60 Seconds (buzzer-beaters count), Streak (one miss ends it).
  Personal bests per mode + difficulty.
- **Flow**: start menu (first-visit tutorial, mode + difficulty, calibration status, best) → "Move into frame"
  checklist (in view, distance, centred, visibility, lighting) → calibration → 3-2-1 → play → game over.
- **Pause menu** (Esc/P/button): resume, restart, recalibrate, change mode, sound/camera; auto-pause when
  the tab is hidden. The game clock stops while paused (flight, hoop and shot clock all freeze).

### Performance pass
- Game camera input at 640×360 (model runs at 256 px anyway) instead of 720p.
- Static arena + floor rendered once to an offscreen canvas; canvas DPR capped at 2; no drawing while hidden.
- Pose models self-hosted (Week 4); slow-tracking warning if pose runs < 15 fps for 5 s.
- Measured: game loop 60 fps, p95 frame 16.8 ms, with pose tracking running (headless Chrome, software GL).

### Tuned values
| Value | Setting | Why |
|---|---|---|
| Rookie / Starter / All-Star / Legend distance | 3.6 / 4.6 / 5.8 / 6.75 m | Close → free throw → mid → three-point line. |
| Rim radius | 0.27 (Rookie) / 0.2286 m | Rookie gets an oversized rim. |
| Hoop motion | All-Star ±0.45 m @ 0.22 Hz; Legend ±0.7 m @ 0.3 Hz | Slow enough to time a shot. |
| Wind | All-Star ±0.6, Legend ±1.2 m/s², 0.1 steps | Visible and readable, never game-breaking. |
| Calibration sensitivity | 0.35 / 0.5 / 0.6 / 0.75 | Rookie forgives ~±10% effort; Legend punishes it. |
| Streak multiplier | ×1.5 at 3, ×2 at 5, ×3 at 10 | Rewards consistency without making a single miss meaningless. |
| Keyboard tap wobble | ±4% power | A tapped Space was a guaranteed swish (19/19 in a test run). |

## Week 4 — The game (`/play`)

### Decision: custom deterministic physics instead of Phaser + Matter.js
Week 7 has the server (Python) re-simulate every throw for anti-cheat. Matter.js can't be reproduced
exactly in Pymunk, so rim bounces would disagree between client and server. `lib/game/physics.ts` is a
small fixed-timestep simulation (circle-vs-point rim, backboard, floor) that ports line-for-line to
Python. Rendering is a custom Canvas 2D scene: one court doesn't need Phaser 4's ~1 MB.

### Added
- `lib/game/physics.ts`: deterministic shot simulation in meters with regulation rim/ball sizes;
  records rim/board/floor/score events; swish / bank / short / long / rim-out classification.
- `lib/game/shot.ts`: ThrowEvent → launch mapping, closed-form ideal power, make-window sweep, keyboard throws.
- `lib/game/game.ts`: canvas scene, arena, 2.5D rim (ball passes behind the front rim/net), net ripple,
  trail, backspin, ghost of the last shot, particles, floating text, live-pose shooter avatar holding the ball.
- `lib/game/sfx.ts`: procedural Web Audio sounds scaled by impact.
- `/play`: score, streak, accuracy; camera PiP with coaching chip; post-shot power gauge with make zone;
  keyboard fallback (tap Space = medium shot, hold = charge, ↑↓ = arc); onboarding card; mute/camera toggles.
- `hooks/useThrowInput.ts`: camera → pose → smoothing → kinematics → detector for the game (reuses Lab thresholds).
- Pose models are now self-hosted in `public/mediapipe/models` (downloaded by `scripts/copy-mediapipe.mjs`),
  with Google's CDN as fallback. On a slow connection the CDN model never finished loading.

### Tuned values
| Value | Setting | Why |
|---|---|---|
| Court | rim 3.05 m, rim Ø 0.457 m, ball r 0.12 m, release 2.1 m, hoop 4.6 m away | Regulation sizes, free-throw distance. |
| Launch speed | 5.5–11.5 m/s across power 0–1 | Puts the make zone at power ≈ 0.33, inside the 0.2–0.5 range real throws produce. |
| Launch angle | 52° base, ±0.3°/° of measured angle, +14° across arc, clamped 35–70° | Measured angle is a noisy 2D projection; a high base angle clears the rim (flat shots clank, as in real basketball). |
| Restitution | rim 0.55, board 0.65, floor 0.62 | Lively but not pinball. |
| Make window at 52° | ≈ 4 percentage points of power | Learnable, but you have to earn it. |

## Week 3.1 — Waves and idle hands no longer fire

Session 2 recordings (6 clips, ~3 min): waving fired 20 times and hands held/wobbling in the air
fired 21 times, while real throws worked. Comparing event features showed what separates them:

| | Real throws | Wave / hands in air |
|---|---|---|
| Hand speed in the 300 ms before (median) | 0.55–0.63 torso/s | 3.1–3.4 |
| Release height (10th percentile) | 0.71 torso above shoulder | mostly 0.22–0.63 |
| Direction (10th percentile) | +13° above horizontal | mostly −3° to +5° |

### Added rules (TS + Python, parity-tested)
| Value | Setting | Why |
|---|---|---|
| `setWindowMs` / `maxSetSpeed` | 300 ms / 1.2 torso/s | A shot starts from a set point; waving never pauses. 1.2 kept 21/21 real throws; 1.4 let a wave back in. |
| `minAngle` | 5° | Shots travel upward; sideways swipes are waves/wobble. |
| `minReleaseHeight` | −0.15 → **0.4** torso | Every real release was ≥ 0.63; margin kept. |

Result: wave 20 → 0, hands-in-air clip 21 → 1, real throws 21 → 19, the "hands raised into position"
false trigger from session 1 is gone. 2 real throws lost: one rushed follow-up (hand never settled),
one released 5° downward. Wrist depth (z) was investigated and rejected: ±0.5 torso jitter, no throw signal.

### Fixed
- Python port now resets body scale on lost tracking and never differences velocity across a gap,
  matching the TS tracker exactly (parity test caught a 1e-4 drift).

## Week 3 — Throw detection

### Changed (breaking units)
- **Normalization switched from shoulder width to torso length** (shoulder midpoint → hip midpoint).
  In the first real recordings shoulder width varied up to 40× as players turned side-on to throw;
  torso length varied ±10%. Speeds are now *torso lengths per second*; reach/height in torso lengths.
  Scale is seeded from shoulder width × 2.3 until hips are seen, and held if hips leave the frame.
- Framing coach uses torso length (and missing hips ⇒ "step back"), so turning side-on no longer says "come closer".
- Hand auto-switch minimum lowered 1.0 → 0.5 (same physical threshold in the new units).

### Added
- `lib/pose/throwDetector.ts`: IDLE / PICKUP / WINDUP / THROW / COOLDOWN state machine emitting `ThrowEvent`.
- Lab: detector panel (live state, last throw meters + angle dial, event log, live threshold sliders,
  copy-params), THROW! flash + sound, throw markers on the speed graph, replay of saved recordings.
- Replay parity test: real recordings run through TS pipeline must match the Python lab's events (6 dp).
- Python lab (`airhoops/lab`): loader, kinematics + detector ports, evaluate/tune CLI, notebooks, tests.

### Tuned values

| Value | Setting | Why |
|---|---|---|
| `startSpeed` | 1.5 torso/s | Below every throw peak seen (2.2–3.2) with margin; above idle jitter. |
| `minHeightStart` | −0.35 torso | Throws start around or above shoulder height. |
| `minPeakSpeed` | 2.0 torso/s | Slowest real throw peaked at 2.2. |
| `minExtension` | 0.62 torso | Real releases reached 0.80–0.83; a bent arm sits ~0.5. |
| `minExtensionGain` | 0.12 torso | Real throws gained 0.22–0.43; rejects waves (reach roughly constant). |
| `minReleaseHeight` | −0.15 torso (→ 0.4 in 3.1) | Release at or above shoulder level. |
| `extensionDrop` / `speedDropRatio` | 0.04 / 0.45 | Release = reach starts falling or speed collapses after its peak. |
| `minThrowMs` | 100 ms | Real throws took 134–200 ms; 1-frame bursts (hands snapping into position) are rejected. |
| `maxThrowMs` | 900 ms | Timeout back to IDLE; then must slow below `startSpeed` to re-arm (prevents re-trigger every frame). |
| `cooldownMs` | 800 ms | README default. |
| `powerMinSpeed`–`powerMaxSpeed` | 1.5–5.0 torso/s | Maps the observed 2.2–3.2 peaks to ~20–50% power until Week 5 calibration. |

All detector values are provisional: chosen from 2 clips and physical reasoning, **not** fitted. Re-run
`python -m airhoops_lab.evaluate --tune` once ≥5 throw and ≥5 non-throw clips exist.

### Known limitations
- One Euro smoothing adapts to on-screen speed, so a player twice as far away sees ~5% lower speed
  while a throw ramps up. Week 5 calibration (done at the player's distance) absorbs this.
- Raising hands into the ready position can fire a throw. Needs non-throw recordings to tune out.

## Week 2 — Kinematics & recorder

### Added
- `lib/pose/oneEuroFilter.ts`: One Euro filter + `PoseSmoother` (arms, shoulders, hips, index fingers).
- `lib/pose/kinematics.ts`: wrist velocity/speed, throw elevation angle, elbow angle, arm extension, auto throwing-hand detection.
- Lab: motion panel with live numbers and a 4 s speed graph; velocity arrow; raw-vs-smoothed comparison; smoothing sliders.
- Recorder: label chips, countdown with beeps, auto-stop, keyboard shortcuts, IndexedDB persistence, per-clip and bulk JSON download, dataset progress (20 throws / 20 non-throws).
- Vitest unit tests for the filter, kinematics and recording format (`npm test`).

### Tuned values

| Value | Setting | Why |
|---|---|---|
| One Euro `minCutoff` | 1.0 Hz | Steady skeleton when standing still without visible drift. |
| One Euro `beta` | 1.5 | Coordinates are 0..1; a fast throw moves the wrist ~2–4 units/s, which lifts the cutoff to ~4–7 Hz, so throws stay snappy. |
| One Euro `dCutoff` | 1.0 Hz | Paper default. |
| Smoother reset gap | 300 ms | After a tracking dropout, restart instead of gliding from stale positions. |
| Velocity window | 50 ms (≈2 frames at 30 fps) | Single-frame differences are too noisy; longer windows blunt the release peak. |
| Shoulder-width EMA | 0.15 per frame | Shoulder width jitters; smoothing it stops that noise leaking into every normalized number. |
| Hand activity τ | 600 ms | Long enough to ignore a single twitch, short enough to switch within one throw. |
| Hand switch rule | other hand > 1.3× and > 1.0 sw/s | Hysteresis so idle jitter never flips the throwing hand. |
| Min wrist visibility | 0.5 | Below this MediaPipe guesses; arm metrics are hidden instead of wrong. |
| Velocity arrow | 120 ms look-ahead, hidden < 0.6 sw/s | Readable length at throw speeds; no flicker when still. |
| Recorder min clip | 8 frames with a person | Discards accidental or empty clips. |

### Units
- Positions are converted to square units (`x * width/height`, `y`) before any distance, so 16:9 cameras don't skew results.
- Speeds were shoulder widths per second (sw/s) in Week 2; superseded by torso lengths in Week 3. Angle is degrees above horizontal.

## Week 1 — Camera & skeleton
- Next.js app, MediaPipe Pose Landmarker (GPU → CPU fallback), mirrored camera, skeleton overlay, FPS/inference/confidence, framing coach, camera error states.
