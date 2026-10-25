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
| `/play` | The game: throw on camera (or hold Space) to shoot at the hoop |
| `/lab` | Tracking lab: live skeleton, motion numbers, throw detector debug, recorder + replay |

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
