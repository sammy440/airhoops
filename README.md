# AirHoops — Frontend

Next.js 16 · React 19 · Tailwind v4 · MediaPipe Pose Landmarker

## Run

```bash
npm install   # also copies the MediaPipe WASM runtime into public/mediapipe
npm run dev   # http://localhost:3000
```

Camera access requires `localhost` or HTTPS.

## Routes

| Route  | Purpose |
|--------|---------|
| `/`    | Landing page |
| `/lab` | Tracking lab: mirrored webcam, live skeleton, FPS / inference / confidence, model + camera switching |

## Layout

```
src/
├─ app/                 # routes
├─ components/lab/      # CameraFeed, SkeletonOverlay, CameraError, LabClient, Controls
├─ hooks/               # useCamera (stream + errors), usePoseTracking (inference loop + stats)
└─ lib/pose/            # poseLandmarker (GPU→CPU fallback), landmarks, drawSkeleton
```

Video frames never leave the browser.
