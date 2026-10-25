// Prepares MediaPipe assets in /public so they're served from our own origin:
//  1. copies the WASM runtime (always matches the installed tasks-vision version)
//  2. downloads the pose models once (falls back to Google's CDN at runtime if missing)
import { cpSync, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmDest = join(root, "public/mediapipe/wasm");
const modelDest = join(root, "public/mediapipe/models");
const MODELS = ["lite", "full"]; // "heavy" (~30 MB) stays on the CDN

if (existsSync(src)) {
  mkdirSync(wasmDest, { recursive: true });
  cpSync(src, wasmDest, { recursive: true });
  console.log("[mediapipe] WASM runtime → public/mediapipe/wasm");
} else {
  console.warn("[mediapipe] tasks-vision not installed, skipping WASM copy");
}

mkdirSync(modelDest, { recursive: true });
for (const m of MODELS) {
  const file = join(modelDest, `pose_landmarker_${m}.task`);
  if (existsSync(file) && statSync(file).size > 1_000_000) continue;
  const url = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${m}/float16/latest/pose_landmarker_${m}.task`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(file + ".part", buf);
    renameSync(file + ".part", file); // never leave a truncated model behind
    console.log(`[mediapipe] ${m} model → public/mediapipe/models (${(buf.length / 1e6).toFixed(1)} MB)`);
  } catch (err) {
    console.warn(`[mediapipe] couldn't download ${m} model (${err.message}); the app will use the CDN`);
  }
}
