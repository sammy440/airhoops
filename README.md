# AirHoops — Frontend

Next.js 16 · React 19 · Tailwind v4 · MediaPipe Pose Landmarker

## Run

```bash
npm install   # also copies the MediaPipe WASM runtime + pose models into public/mediapipe
npm run dev   # http://localhost:3000
```

Camera access requires `localhost` or HTTPS.

## Routes

| Route  | Purpose |
|--------|---------|
| `/`    | Landing page |
| `/play` | The game: throw on camera, or hold Space / press the court to shoot |
| `/multiplayer` | Rooms, shootout and race matches with friends |
| `/leaderboard` | Daily, weekly and all-time boards + your personal bests |
| `/profile` | Your player: name, body, skin tone, hair, kit |
| `/privacy` | What stays on the device, what's stored online, delete your data |
| `/lab` | Tracking lab: live skeleton, motion numbers, throw detector debug, recorder + replay |

## Environment

| Variable | Default | |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | AirHoops API (airhoops-backend) |
| `NEXT_PUBLIC_WS_URL` | API URL with `ws(s)://` | only if WebSockets live elsewhere |
| `NEXT_PUBLIC_SITE_URL` | `https://airhoops.vercel.app` | absolute URL for share previews (set it if you add a custom domain) |
| `NEXT_PUBLIC_RELEASE` | | optional tag attached to crash reports (e.g. the git SHA) |

## Deploy (Vercel)

1. Import this repo in Vercel (framework: Next.js; defaults are fine).
2. Set `NEXT_PUBLIC_API_URL=https://<your-api-host>` (and `NEXT_PUBLIC_RELEASE=$VERCEL_GIT_COMMIT_SHA` if you like).
3. Deploy, then add the Vercel URL to the API's `ALLOWED_ORIGINS`.

The build downloads the MediaPipe pose models into `public/mediapipe` (`prebuild`), so they're served from the
site itself. Vercel provides HTTPS, which browsers require for camera access. Security headers
(`Permissions-Policy: camera=(self)`, `X-Frame-Options`, HSTS…) are set in `next.config.ts`.

Production crash reports (uncaught errors, error boundaries) go to the API's `/telemetry/errors`.

## Scripts

```bash
npm run dev        # dev server
npm test           # unit tests (Vitest)
npm run lint       # ESLint
npm run typecheck  # TypeScript
```

## Layout

```
src/
├─ app/                 # routes
├─ components/lab/      # CameraFeed, SkeletonOverlay, CameraError, LabClient, Controls
├─ hooks/               # useCamera, usePoseTracking (inference loop), useRecorder
├─ lib/game/            # deterministic physics, throw→launch mapping, canvas game, sounds
├─ lib/pose/            # poseLandmarker, landmarks, drawSkeleton, oneEuroFilter, kinematics, throwDetector
└─ lib/recorder/        # recording format (README §7.1) + IndexedDB store
```

Video frames never leave the browser.

## Photos

All photos are from [Unsplash](https://unsplash.com) under the free Unsplash License (no Unsplash+).
They are registered, with alt text and source links, in `src/lib/images.ts`. To swap one, replace the
file in `public/` (same name) — static imports give each file a content-hashed URL, so caches update automatically.
