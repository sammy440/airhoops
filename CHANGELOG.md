# Changelog

Every tuned threshold is recorded here with the reason, as the project README asks.

## Chat window: bigger, a phone sheet, a real icon
- Match chat opens a taller panel (26 rem wide, up to 30 rem tall, sized to stay clear of the scoreboard) with a
  header and close button; messages fill the space and the input sits at the bottom. On a phone it's a sheet from
  the bottom, full width (78 % of the screen), like a messaging app; nothing overflows.
- The quick-chat suggestions are for starting a conversation: once you've sent a message (typed or quick) they're
  hidden. Quick match keeps them, as it's quick chat only there.
- The 💬 bubble is a mail icon; it turns light while the chat is open; the unread badge stays.
- The panel is opaque (the court no longer shows through behind the messages).

## Fix: match clocks counted down during the countdown
- A race's end time from the server includes the 3 s countdown, and the match screen showed the time to it, so a
  60 s race read 1:03, 1:02, 1:01 while the countdown ran. The race clock now holds at the full length through the
  countdown and starts at "GO" (checked: 0:30 through 3-2-1, then 0:29, 0:28…). A turn clock (shootout,
  H-O-R-S-E) likewise holds at its full length until the turn opens. Solo timed and daily runs already started
  their clock at "GO" (checked).

## Room chat (never stored)
- **Friends' rooms** (joined with a code): free text, up to 200 characters. **Quick match** (strangers): quick chat
  only, eight preset phrases sent by id ("Good game!", "Nice shot!", "Rematch?"…), like reactions. Quick-chat
  buttons in friends' rooms too. Lobby: a chat panel under the reactions. Match: a 💬 bubble with an unread
  count (a new message also toasts), opening a panel over the court and the results.
- **Never stored, anywhere:** the server checks a message and relays it to the room, nothing else. No database
  table, no log line (only HTTP request lines are logged; WebSocket messages never are), no history in the room,
  nothing replayed on reconnect (tested). In the browser it lives in memory only and is cleared on leaving.
- Server checks (`app/chat.py`): control and zero-width / bidi characters removed, whitespace collapsed, links ->
  [link], emails -> [hidden], common profanity masked as whole words (f***; "scunthorpe" is safe), 200 characters,
  5 messages per 10 s ("Slow down a little").
- **Mute** a player (in memory, for this room): their messages are hidden ("2 messages from muted players hidden").
- Typing in the chat box never shoots or reacts: Space, arrows and 1–6 are left to the text field.
- Privacy page: chat entry.

## How to play page; the lab is dev-only; privacy brought up to date
- **`/how-to-play`** (nav, footer, home page and start menu link to it): quick start, camera placement with a
  diagram (side view: laptop screen and front camera facing you 2–3 m away; and what the camera should see: you
  centred, head to hips, room above your hands), room lighting (light in front, no window behind, bright and
  even), posture and the set-and-push shot, power / lean aim / the green rim, hot hand and hands-free buttons,
  keyboard and touch, and what to do if throws don't register. Its advice matches what the setup check measures.
- **The tracking lab is a developer tool now:** `/lab` is a 404 (noindex) in production builds and gone from the
  nav and footer; it's there under `next dev`, with a Lab link in the nav (`lib/devTools.ts`).
  `NEXT_PUBLIC_ENABLE_LAB=1` keeps it in a production build.
- **Privacy:** throws in multiplayer include aim and whether they were thrown on camera; reactions are relayed,
  not stored; the profile includes your ball and trail; the lighting check runs on your device; XP is erased with
  your data; shared clips go wherever you send them; the lab paragraph is gone; "no accounts" corrected (Google
  sign-in is optional).

## Green rim: longer, with a warning in 2D
- Green for longer each 3 s loop: 1.2 s Rookie, 1.0 Starter, 0.8 All-Star, 0.6 Legend (was 0.7 / 0.55 / 0.42 /
  0.3: in 2D, with no light to watch coming round, it was over before you could react). Server and parity
  fixtures updated to match.
- 2D: a faint green glow builds over the second before the rim turns green, so the throw can be timed.

## Fix: camera throws not registering
- **Lab thresholds no longer leak into the game.** Every lab slider is saved as you move it, and the game read
  those saved values: an old experiment, or values from an earlier detector, silently made throwing in Play and
  matches harder. The game now uses the tuned defaults unless "Use these thresholds in the game too" is ticked in
  the lab's detector panel (off by default).
- **A replay never swallows a camera throw.** A throw during an instant replay only skipped it (the ball wasn't
  back yet). Now raising the ball to shoot ends the replay, and a camera throw during one ends it and shoots.
  Keys and taps still just skip.
- **Less work beside pose tracking.** Frame rate matters: on the lab recordings (~18 fps) the detector catches
  11/12 throws, 9/12 at half the frame rate, 6/12 at a quarter. With the camera on, clips record at 15 fps and
  960 px (30 fps / 1280 px otherwise), and the green-rim countdown ticks in its own component instead of
  re-rendering the whole Play screen 10 times a second.

## The green rim, and the stance without a camera
- **Green rim (camera play):** a green light loops round the rim every 3 s (`green.ts`); from the shooter's view it
  slides left to right across the front and back along the far side. As it passes the front the rim and net glow
  green, for 1.2 s on Rookie, 1.0 Starter, 0.8 All-Star, 0.6 Legend. **A camera throw released then swishes,
  however it was thrown** (+1 swish bonus, "GREEN SWISH!"); any other time it flies as thrown. In 2D, where the loop
  can't be seen side-on, the rim simply lights up green. A cue under the court counts down ("Green rim in 1.2s")
  and flips to "● Rim is green: shoot now!". Keyboard and touch throws don't get it.
- The shot: `greenLaunch`, a fixed, ordered search from the ideal 52° speed with the aim that meets the hoop where
  it will be in that wind, nudging speed and aim until it swishes. Aim may go to ±20° (a thrown shot stops at ±12°):
  Legend with full wind and the hoop at the end of its slide needs ~14°. Tested: swishes on every level, every wind,
  every hoop position.
- **Everywhere, refereed:** counts on every leaderboard; in matches the server applies the same rule on the match
  clock (`app/game/green.py`, throws carry `camera`), and the parity fixtures pin both sides to the same green
  timing and the same launch (144 cases). Both sides use the same arithmetic (`d * PI / 180`, Python-style `%`) so
  they agree to the last bit at a window's edge.
- **Without a camera, the avatar only raises the ball to shoot:** with the ball it's held at chest height on the
  shooting side (off-centre so the camera behind the shooter still sees it); charging raises it into the set; after
  the follow-through the arms drop, and stay down until the ball is back. 3D poses are built from the avatar's own
  bone lengths (tested), 2D eases between them. Camera play is unchanged: your body drives it.

## Fixes: phone match layout, opponents' ball skins, aim readout, touch checked
- **Match screen on a phone held upright:** the camera box, scoreboard and turn banner no longer overlap. Below
  `sm`, the camera box sits bottom-left above the reactions (`CameraPip` takes a `position`), the scoreboard is
  narrower under the header, the round / clock title is smaller, and the banner sits at 34% height. Measured on a
  390×844 screen: no overlaps.
- **Opponents see your ball and trail** (shootout, H-O-R-S-E: everyone watches the shooter's shot). Your pick is
  sent to your account (`PATCH /auth/me {loadout}`) and rooms relay it, but only what you've unlocked: the server
  checks it against your level (`app/game/cosmetics.py`), so editing local storage can't show a locked skin. A
  level-up at match end re-checks it. A ball in the air keeps its thrower's look: a change (e.g. the turn passing
  while the last shot is still flying) waits until it lands.
- **Lean aim readout:** with the camera on, "Lean aim: 4° ← left / straight / 3° right →" under the shot card,
  live, so the direction is easy to check (and to aim by).
- **Touch on a phone** checked with real multi-touch input (Chrome DevTools touch events) at 390×844: a swipe
  orbits and never shoots, pinching apart zooms in and together zooms out, Reset view returns to the shooting
  view, and a tap shoots.

## Shareable clips
- **Save the last 8 seconds** of play as an MP4 any time: the film button in the HUD, **C**, or "Save a clip" on
  the game-over screen. A preview loops in a dialog with **Share clip** (the share sheet on phones; a download
  elsewhere). The game pauses while it's open. No sound.
- How: every frame the game draws is composited into a 1280-px canvas (the court, the score top left, the
  AIRHOOPS wordmark and site bottom right) right after it's drawn, and encoded straight away with WebCodecs
  (H.264, VP9 where that's all there is), 30 fps, 3.5 Mbps (`lib/clips/clipRecorder.ts`). Only the newest ~9 s
  of encoded video is kept, so saving is just packing it into an MP4 (`mp4-muxer` 5.2.2): instant, no
  re-encoding. Records only while a run is on and not paused.
- Keyframes every second of **real time**, and a clip starts on the last keyframe before the 8 s mark: keyed by
  frame count, a slow device (3 fps in testing) had one keyframe in the window and saved a one-frame clip.
- **Your camera is only in clips if you turn it on** ("Show me (my camera) in clips", off by default), drawn
  mirrored in a rounded inset. Settings under View in the start menu; "Record clips" (on by default) stops it
  entirely. Hidden in browsers without WebCodecs. Nothing is uploaded unless you share it.
- `shareImage` is now `shareFile` (it shares videos too).

## XP, levels and unlocks
- **XP from play** (`xp.ts`, mirrored by the backend's `app/game/xp.py`; same examples tested on both sides):
  1 a shot, 10 a make, +5 a swish or bank, +5 per make in your best streak beyond the second, 25 a finished
  timed/streak/daily run, 50 for the day's daily challenge (once), 20 a finished match, 50 a win. Level 2 at 100 XP,
  each level 50 more than the last (level 6 ≈ 1,000 XP, 10 ≈ 2,700), max 50. A 30 s rookie run earns ~80.
- **Unlocks** (`cosmetics.ts`): ball skins Retro (Lv 3), Gold (6), Ice (10), Lava (15), Galaxy (22); fire trails
  Blue flame (4), Toxic (8), Royal (12), Rainbow (18). Picked in the new **Locker** on the profile page; shown in 3D
  and 2D, on your screen. Every court and avatar option stays free.
- **Device + account.** Solo play is recorded on the device as it happens (`progress.ts`) and sent to your account
  as play stats at the end of a run, every 25 shots in free play, and when the tab hides; the server works the XP
  out itself and caps solo XP at 6,000 a day. Without an account XP stays on the device; play from before you had
  one is sent when you do (a backlog over 2,000 shots is scaled down to one batch). Shown XP is the larger of the
  device's own count and the account's total plus unsent play, so it never visibly drops. Multiplayer XP is awarded
  by the server at match end.
- On screen: level bar on the start menu, "+N XP" with a level-up and what it unlocked on game over and match
  results, a "Level N!" pill mid-run, level chips next to names in the lobby and on the match scoreboard.
- Server fix found on the way: when the buzzer and a last throw ended a match at the same moment, the end-of-match
  hook ran twice (multiplayer scores were saved twice). It now runs once per match.

## Match reactions
- **Six quick reactions** (🔥 👏 😂 😮 💪 🏀): tap the bar (bottom-right in a match, under the players in the lobby)
  or press 1–6 in a match. They float up the screen with the sender's name for 2.4 s, for everyone in the room
  (you see yours as "You"), over the results screen too, for a "GG".
- On the wire they're ids (`react{reaction}` → `reaction{playerId, reaction}`), never free text: the server
  only relays the known six. At most 4 per player per 3 s: the server drops extras quietly and the bar mirrors
  the limit (it dims instead of sending what would be dropped). On screen: the newest 12 at most.
- Buttons give up focus after a click, so Space goes back to shooting. With reduced motion they fade in place.
- No gesture trigger: arm-up gestures are the shooting stance (hands high = set point), so one could fire a throw
  or be mistaken for one mid-match.

## H-O-R-S-E (multiplayer)
- **New room mode.** The setter shoots; a make becomes the challenge by its kind: **SWISH** (touched nothing),
  **BANK** (off the glass) or **BUCKET** (any other make). Everyone else, in order after the setter, gets one try
  to match it (a bucket is matched by any make); a failed match is a letter, and H-O-R-S-E is out. The setter keeps
  setting until they miss, then the next player sets. Timeouts count as misses; last one standing wins.
- Every shot is from the same spot, so the shot's *kind* is what's matched: the physics already reports swish / bank.
- The server referees it (`app/match.py`; `turn` carries `setter` and `challenge`; new `challenge` and `letter`
  messages; `letters` on the scoreboard). A 150-shot cap ends a marathon with the fewest letters winning. No
  leaderboard: it's won on letters, not points.
- Match screen: banner "Set a shot" / "Match the BANK · off the glass" (or "Bo is setting" / "Bo must match the
  SWISH"), the challenge in big type up top, H O R S E letters lit per player on the scoreboard and results, "sets"
  next to the setter, toasts for each challenge and letter. Lobby: a third mode card.

## Ghost of your best run
- **Timed and Daily runs race your best**: a see-through cream ball flies your best run's shots at the same moments
  (2D and 3D), and the HUD shows "vs best +4 / −3 / level" (the ghost's points count once its ball drops through).
- Only the launches are stored (speed, angle, aim, wind, hoop phase, points; `airhoops.ghosts` in localStorage,
  keyed like bests). The physics is deterministic, so re-simulating them gives the exact flights (`ghostRun.ts`).
  A new best on the clock replaces the ghost ("Saved as your ghost" on the game-over screen); old daily ghosts are
  dropped, as only today's challenge can be raced.
- Run time counts from "GO!", not from the countdown: the countdown runs on wall time, and a struggling device's
  game clock (frames capped at 100 ms) covers less of it, which put the ghost seconds ahead in testing. The ghost
  waits out pauses and replays with you, and hides during a replay.
- The moving hoop now starts from the same spot every run (it already did on the daily), so the ghost's shots meet
  the hoop where it is.
- A start-menu toggle for Timed / Daily: "Race the ghost of your best run" (on by default).

## Instant replays, bank bonus, phone look tip
- **Instant replay** (solo, 3D): the make that catches fire and every 5 in a row after it, every bank shot, and a
  swish once 4+ shots have passed since the last replay (`replay.ts`). Kept rare so it's a treat, not a toll.
  The last ~1.4 s of flight (0.95 s before the drop through the net, 0.45 s after) replays at 0.45× speed (about 3 s), from
  courtside level with the rim, drifting along the baseline and easing in and out of the player's view.
  Rim, board and net sounds replay; no points. Letterbox bars with the caption ("BANK SHOT", "ON FIRE").
- The game clock stands still during a replay, so timed and daily runs don't lose time, and a moving hoop slides
  exactly as it did. Replay speed follows real frame time, so it lasts as long on a slow phone.
- A tap, a click, Space or a throw skips it. Off in matches (they keep their pace) and with `prefers-reduced-motion`
  (the camera sweeps). A toggle sits under View in the start menu ("Instant replays of great makes", on by default).
- **Bank shots earn +1** (`BANK_BONUS`), like a swish. The two never stack (a swish touches nothing), so a make still
  earns at most +1 and the API's per-make cap holds. The backend scores matches the same way; parity fixtures were
  regenerated (25 of 1,440 cases are banks). Shot tip: "Off the glass! Bank shots earn +1."; match toasts say BANK.
- **Phones get a one-time tip** in their first 3D run: "Swipe to look around · pinch to zoom" (from 1.5 s to 8 s
  into the run, or until they swipe), since the hint line is hidden on small screens.
- `ON_FIRE` moved to `scoring.ts` next to the streak tiers (re-exported from `engine.ts`).

## Look around the 3D court
- **Drag (mouse) or swipe (touch) to swing the camera around the court**; a swipe glides on for a moment after
  you let go. **Mouse wheel or two-finger pinch to zoom.** The camera orbits the middle of the court and stays
  between nearly overhead and just above head height, 0.45–1.9× the normal distance. The make "punch" and the
  on-fire shake still play from wherever you're looking.
- **Reset view** (top-right button, Play and matches) eases back to the shooting view the short way round; it only
  shows once the view has moved.
- Press and hold without moving still charges a shot; once the press moves more than 8 px it becomes a look and the
  charge is dropped, so looking around never fires a shot. Two fingers never shoot.
- One gesture handler for both screens (`hooks/useCourtGestures.ts`); the screens only supply start / release /
  cancel for a charge. The 2D view ignores looking around.

## 3D, stage 5: aim coaching, effects, performance
- **Coaching knows direction** (`coachShot` in `shot.ts`, `ShotGauge`). Direction comes from where the ball was
  heading as it reached the hoop, before any rim or board contact (x is unaccelerated, so it's exact: aim,
  crosswind drift and where a moving hoop will be). Distance is the power window with the direction put right, so
  a shot that was only wide isn't told its power was off (this replaces the old "that arc can't reach" for aim
  misses). Tips combine both: "Wide right and short: lean a little left and push about 10% harder"; keyboard
  players get "aim 3° left (←)". A second bar shows your direction against where the rim was.
- **On fire** at 5 in a row (the ×2 streak tier, `ON_FIRE`): flame halo on the ball, a fire trail in flight
  (2D too), the rim glows and the net burns orange. Catching fire whooshes; the crowd's cheer grows with the
  streak; a streak of 3+ ending on a miss gets an "aww". Matches use your server-side streak.
- **Camera punch** on a make (bigger on a swish or on fire, a shake on fire); off with `prefers-reduced-motion`.
- **Adaptive quality** in the 3D renderer: below ~40 fps for 2 s the resolution drops a step (to 0.6× at the
  least), above ~58 fps for 6 s it climbs back. The slow-tracking hint suggests Classic 2D.

## The avatar never distorts
- `Retargeter` (`pose3d.ts`) replaces copying joint positions. The avatar keeps its own proportions (`BONES`, the
  stance's bone lengths) and the pose only steers it: each arm bone's direction, the upper body's lean (±0.15 m),
  the shoulders' tilt (±25°), the knee dip. Standing too close, off to the side, or with the hips out of frame
  gives the same body (scale is learned from the torso and kept when the hips leave).
- A bone that looks shorter on camera than it is points at the camera: the missing length becomes forward reach
  (towards the hoop), so a push at the screen reads as one instead of shrinking the arm.
- A bone the camera loses keeps its last direction for 0.6 s, then eases back to the stance over 0.4 s.
- Checked by replaying the lab recordings as recorded and scaled ×1.8 / shifted sideways: same body.
- **Fix: aim direction.** Frames reach MediaPipe unmirrored (only the preview is flipped), and the recordings
  confirm it (the right wrist sits on the image's left), so the player's right is the image's left. `leanAim`
  now follows that geometry; it had been fitted to the lean clips' labels, which most likely followed the
  mirrored preview (screen left = the player's right) and would have aimed every lean the wrong way.

## Throws that register, jump for distance, lean to aim (3D stage 2)
- **Elbow snap** (`throwDetector.ts` + `detector.py`): a second throw trigger for pushes towards the camera,
  which gain little reach in 2D. From a still, two-handed set overhead, the elbow straightens fast and the wrist
  rises → a throw. A snap can also complete a throw the reach-based path started. Lab (Oct 31 aimed clips): 72%
  → 94% of throws counted (left 13/13, right 9/11, straight 8/8); head scratching and dribbling never trigger;
  a two-handed overhead wave triggers once. Thresholds in the lab README.
- **Jump adds distance instead of being needed.** Power comes from the arm's speed relative to the shoulders
  (`armSpeed`); the shoulders' rise just before release gives `jump` (0..1: standing throws rose 0.2–0.8
  torso/s, jumping ones 1.4–2.7), worth +0.2 power uncalibrated. Calibration (now version 2: old ones are
  dropped, players recalibrate once) learns your arm speed and your usual jump; jumping harder than in practice
  adds up to 12% launch speed (`JUMP_GAIN`).
- **Aim by leaning** (`lib/game/aim.ts`): shoulders over hips at release, against your straight lean
  (calibration, else a running average of your throws). Dead zone 0.01 torso, 100° per torso, ±12°. On the lab
  clips: 6/7 straight throws within a make, 10/12 left leans aimed left, 9/9 right leans aimed right.
  ←/→ aim from the keyboard. Multiplayer sends the aim; the API already simulates it.
- **Aim guide** on the 3D court: a row of dots and a chevron from the shooter to the rim, swung by the aim
  (live lean, or the keyboard aim), shown while the ball is in hand.
- Kinematics gained `handsApart`, `body` (shoulder velocity), `lean`, and `fallback` (the chosen wrist is out of
  view): the detector treats a fallback frame as the arm being lost instead of following the other arm, and
  starts afresh when the shooting hand switches. Same in the Python port; parity fixtures regenerated with all
  15 recordings (75 events, identical in both). `throw-right` (Oct 30, wrist visible in 31% of frames) is kept for
  parity but excluded from the "detects the throw" check.

## 3D, stage 4: the 3D player
- `lib/game/pose3d.ts`: pose → 3D skeleton, mirror-style, from image x / y only. Legs are solved (two-bone,
  real thigh/shin lengths) so knees bend and feet stay on the floor; a knee bend the camera sees becomes a
  **dip** of the whole body. Without a camera (keyboard, or watching another player's shot): an animated stance
  that **sinks while charging**, then plays the **release, hop and follow-through** (shooting arm up, wrist
  flicked) and settles back into the set.
- `lib/game/player3d.ts`: the player model. Capsule limbs, shaped torso (sleeveless jersey with neck and hem
  trim, number on the back), shorts over the thighs, hands pointing along the fingers, head with ears, all six
  hair styles, socks and shoes with white soles, slimmer build for the female body. Joints ease towards each
  pose (snappy for the camera, softer for the stance).
- Camera moved back and tilted down a little so the player's back and shoulders are in view.
- **Tried and dropped: turning the body with the shoulders.** A shoulder turn from MediaPipe depth (z) looked
  right on big turns, but standing square it swings ±30° frame to frame, and side-on MediaPipe swaps the left
  and right shoulders, so the sign flips (lab: `turn-left` read anywhere from −75° to +82°). Hips are no better.
  Too noisy to draw, and unusable as an aim control.
- Aim lead for stage 2: **lean** (shoulder midpoint over hip midpoint, image x only) was steady across straight
  throws (sd 0.013–0.020 torso lengths) and separated the left- and right-turn clips by ~10× that.

## 3D, stage 3: the 3D court
- New WebGL renderer (`lib/game/game3d.ts`, three.js 0.186.1): the court from behind the shooter's right
  shoulder. Hardwood/blacktop/sand floor with real markings (lane, free-throw circle, three-point arc,
  baseline), glass backboard with target square, rim and bracket, a 12-strand net that swings on makes,
  stanchion behind the baseline, and the wind flag on the board's corner (points downwind, longer when gusty).
  The hoop group slides sideways with the moving-hoop phase. Ball with seams, backspin, blob shadow, trail,
  "loaded" ring, hot-hand halo, charge ring; dashed path of the last shot; sparks; floating text sprites.
- A basic 3D player in your look (skin, hair style + colour, jersey with your number on the back, shorts,
  shoes), arms following the live pose; a set-shot stance without a camera. Full 3D player: stage 4.
- Game logic moved out of the 2D engine into `engine.ts` (`GameCore`: clock, playback, events, results,
  respawn, dribbles, particles, texts), now in 3D coordinates. `game.ts` is just the 2D painter on top.
- `createGame()` picks the renderer: **3D by default**, Classic 2D from the new "View" switch in the start
  menu, and automatically when the browser has no WebGL (or context creation fails). Multiplayer uses the
  same choice. Per-theme 3D colours in `courts3d.ts`.
- Cheap on purpose (pose tracking already busy): no shadow maps, low-poly meshes, two lights, DPR ≤ 2.
- Known gap: the post-shot gauge only understands distance, so with a sideways hoop it can say "that arc
  can't reach" for a shot that was just aimed wrong. Coaching for aim is stage 5.

## 3D, stage 1: physics
- `physics.ts` is now 3D: x = toward the hoop, y = up, **z = sideways** (+ = the shooter's right). Paths are
  `[t, x, y, z]`, events and results carry z / `lateral`, misses can be `left` / `right`.
  - Rim: the nearest point of a real ring. Backboard: a 1.83 m rectangle with face and four edges.
  - Launches have an `aim` (degrees). `throwToLaunch` maps a throw's sideways angle through `aimGain` 0.3,
    clamped to ±12° (placeholders until aim from the camera is tuned in stage 2).
  - **Gameplay change:** the All-Star / Legend hoop now slides **sideways** and wind is a **crosswind**, so aim
    matters. A straight, windless shot at a still hoop is bit-for-bit the old 2D physics (checked against all
    240 such cases in the old parity fixtures before regenerating them).
  - Distances use `Math.sqrt` of sums, not `Math.hypot`: IEEE sqrt rounds identically in JS and Python.
- Parity fixtures regenerated with aim: 1,440 cases (straight, right, past the left limit), all matching the
  API's Python port. Multiplayer throws now send `aim`.
- **Not shippable on its own:** the 2D view can't show a sideways hoop or crosswind, and camera throws send aim 0
  until stage 2. Ship together with the 3D renderer (stage 3).

## Quick match
- `/multiplayer` has a **Quick match** card: pick a difficulty (or "Any", fastest) and **Find a game**. The
  waiting screen polls `POST /quickmatch` every 2 s, shows how long you've waited and how many others are
  searching, and suggests "Any" after 30 s. Cancel (or leaving the page) takes you out of the queue.
- Paired players land in a 60-second Race room that starts by itself once both are connected: no code, no ready-up,
  no host button. After the game it's a normal room (rematch, settings).
- If the stranger never shows up or leaves, the room says so and offers **Find another player**.

## Rejoin your room
- `/multiplayer` remembers the room you're in (`airhoops.room`). Come back without the invite link (closed the
  tab, went to /play, clicked Multiplayer in the nav) and it puts you straight back in, mid-match included, as
  long as the server still holds your seat (`RECONNECT_GRACE_S`, 30 s). If the seat has gone, it forgets the room.
- Leaving the room, or being closed out of it, clears it. A refresh already worked (the URL keeps `?room=`).

## Hot hand
- Dribbles now matter (solo): **4 bounces in rhythm** heat your hand up, and your next make scores **one streak tier
  higher** (×1 → ×1.5, ×1.5 → ×2, ×2 → ×3; ×3 stays ×3). The hand cools off 4 s after the last bounce, so you
  dribble *into* the shot, and the next shot uses it up, made or missed (`lib/game/hotHand.ts`, `hotMultiplier`).
- Capped at the top tier, so a hot make never beats the API's per-make limit: no backend change needed.
- HUD: "Heating up ●●○○" while you dribble, then "Hot hand · next make ×1.5"; the ball gets a flickering orange
  halo, and the floating score says HOT. Hidden in Streak mode (it scores the streak, not points).
- Not in multiplayer: the server scores those shots and doesn't know about dribbles.
- Tutorial step 5 is now "Heat up".

## Daily Challenge
- New **Daily** mode (`lib/game/daily.ts`), first in the mode picker: one timed run per UTC day, the same for
  everyone. The day's difficulty (Starter / All-Star / Legend) and clock (30 / 60 / 90 s) come from a 32-bit hash
  of the day number; shot *n*'s wind comes from the same seed; the moving hoop's clock starts with the countdown,
  so it's in the same place at the same moment for every player. Play as often as you like; your best run counts.
- Start menu shows today's rules, a countdown to the next challenge and a link to today's board.
- Leaderboard: a **Daily** row with today's and yesterday's boards (`daily20261030`). Daily boards ignore the
  period and difficulty filters, since each one is a single day at a single difficulty.
- The API ports the same rules (`app/game/daily.py`) and rejects daily runs with the wrong difficulty, too many
  shots for the clock, or a date more than a day from today. `daily.test.ts` and the API's `test_daily.py` pin
  the same dates, so the two can't drift apart silently.
- Fix: the shot gauge's target window now uses the hoop's real phase (`game.hoopPhase`) instead of the raw clock.

## Hands-free menus
- **Raise a hand** (`lib/pose/raiseHandDetector.ts`): hold a hand up high and still for 1 s to press the main
  button: Start, Save & continue (calibration), Resume, Play again. A pill at the bottom shows what it will do,
  with a ring that fills as you hold. Not during a run: the set point ("hold it high, pause") looks too much like
  it, and an accidental pause mid-run is worse than reaching for Esc.
  - Thresholds: wrist ≥ 0.7 torso above the shoulder, ≤ 1.2 torso/s, held 1000 ms (150 ms grace for tracking
    blips). In the recordings no throw, wave or head scratch stays that high and still for more than 360 ms,
    and a head scratch peaks at 0.5. Replayed in `raiseHandDetector.test.ts`.
  - Every screen change disarms it until both hands drop below the shoulders, so an arm still up from the last
    shot can't press the next screen's button.
  - Not in multiplayer yet: the lobby doesn't run the camera, so "I'm ready" still needs a click.
- **Skip setup for returning players**: once you've passed the "Move into frame" check, Start goes straight to
  the countdown if you're already tracked, framed and visible (confidence ≥ 0.6). Otherwise the check shows as before.

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
