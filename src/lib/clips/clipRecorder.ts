import { ArrayBufferTarget, Muxer } from "mp4-muxer";

/**
 * Instant clips: the last few seconds of play, ready to share as an MP4.
 *
 * Each frame the game draws is composited into a small canvas (`capture`) and encoded
 * straight away with WebCodecs, a keyframe every second of real time (not every N frames:
 * a struggling device draws fewer, and a clip has to start on a keyframe). Only the newest ~CLIP_SECONDS
 * of encoded video is kept, so saving a clip is just packing those chunks into an MP4
 * (`save`): no re-encoding, no waiting. Nothing leaves the device unless you share it.
 */

export const CLIP_SECONDS = 8;
const FPS = 30;
const MAX_SIDE = 1280;
const BITRATE = 3_500_000;
/** Codecs to try, most widely playable first (H.264 plays everywhere; some browsers can only encode VP9). */
const CODECS = [
  { codec: "avc1.4d0028", mux: "avc" as const },
  { codec: "avc1.42001f", mux: "avc" as const },
  { codec: "vp09.00.10.08", mux: "vp9" as const },
];

export interface Chunk {
  data: Uint8Array;
  key: boolean;
  /** µs */
  timestamp: number;
  duration: number;
}

/**
 * Drops chunks too old to be in a clip, always keeping the clip decodable: the oldest chunk
 * kept is a keyframe at or before `windowUs` from the newest.
 */
export function pruneChunks(chunks: Chunk[], windowUs: number): Chunk[] {
  if (!chunks.length) return chunks;
  const cutoff = chunks[chunks.length - 1].timestamp - windowUs;
  let start = 0;
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].timestamp > cutoff) break;
    if (chunks[i].key) start = i;
  }
  return start ? chunks.slice(start) : chunks;
}

/**
 * The chunks for a clip: from the last keyframe at or before the window's start, so a clip is
 * never shorter than the window when that much is recorded (at most a second longer).
 */
export function clipChunks(chunks: Chunk[], windowUs: number): Chunk[] {
  if (!chunks.length) return [];
  const cutoff = chunks[chunks.length - 1].timestamp - windowUs;
  let start = -1;
  for (let i = 0; i < chunks.length && (start < 0 || chunks[i].timestamp <= cutoff); i++) if (chunks[i].key) start = i;
  return start >= 0 ? chunks.slice(start) : [];
}

export function clipsSupported() {
  return typeof window !== "undefined" && "VideoEncoder" in window && "VideoFrame" in window;
}

/** Even dimensions that fit MAX_SIDE, keeping the aspect (encoders want even sizes). */
export function clipSize(w: number, h: number) {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const even = (n: number) => Math.max(2, Math.round((n * k) / 2) * 2);
  return { width: even(w), height: even(h) };
}

export type Overlay = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

export class ClipRecorder {
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private encoder: VideoEncoder | null = null;
  private mux: "avc" | "vp9" = "avc";
  private decoderConfig: VideoDecoderConfig | undefined;
  private chunks: Chunk[] = [];
  private frames = 0;
  private lastAt = -Infinity;
  private lastKeyAt = -Infinity;
  private t0 = 0;
  private forceKey = true;
  private failed = false;

  private constructor() {}

  /** A recorder for a `w`×`h` view, or null if this browser can't encode video. */
  static async create(w: number, h: number): Promise<ClipRecorder | null> {
    if (!clipsSupported()) return null;
    const rec = new ClipRecorder();
    const { width, height } = clipSize(w, h);
    rec.canvas.width = width;
    rec.canvas.height = height;
    for (const c of CODECS) {
      const config: VideoEncoderConfig = {
        codec: c.codec,
        width,
        height,
        bitrate: BITRATE,
        framerate: FPS,
        latencyMode: "realtime",
        ...(c.mux === "avc" ? { avc: { format: "avc" as const } } : {}),
      };
      try {
        const { supported } = await VideoEncoder.isConfigSupported(config);
        if (!supported) continue;
        rec.mux = c.mux;
        rec.encoder = new VideoEncoder({
          output: (chunk, meta) => rec.onChunk(chunk, meta),
          error: () => {
            rec.failed = true;
          },
        });
        rec.encoder.configure(config);
        return rec;
      } catch {
        // try the next codec
      }
    }
    return null;
  }

  get width() {
    return this.canvas.width;
  }
  get height() {
    return this.canvas.height;
  }

  /** Seconds of video available for a clip right now. */
  get seconds() {
    const c = clipChunks(this.chunks, CLIP_SECONDS * 1e6);
    return c.length ? (c[c.length - 1].timestamp - c[0].timestamp) / 1e6 : 0;
  }

  /**
   * Call right after the game draws (a WebGL canvas is only readable then). Throttled to the
   * clip's frame rate; skips frames while the encoder is behind.
   */
  capture(source: CanvasImageSource & { width: number; height: number }, overlay?: Overlay) {
    const enc = this.encoder;
    if (!enc || this.failed || enc.state !== "configured") return;
    const now = performance.now();
    if (now - this.lastAt < 1000 / FPS - 2) return;
    if (enc.encodeQueueSize > 3) return;
    if (this.frames === 0) this.t0 = now;
    this.lastAt = now;
    const { width: w, height: h } = this.canvas;
    // Cover: fill the clip, cropping the longer side if the view's shape changed (e.g. a phone rotated).
    const k = Math.max(w / source.width, h / source.height);
    const sw = w / k;
    const sh = h / k;
    this.ctx.drawImage(source, (source.width - sw) / 2, (source.height - sh) / 2, sw, sh, 0, 0, w, h);
    overlay?.(this.ctx, w, h);
    const frame = new VideoFrame(this.canvas, { timestamp: Math.round((now - this.t0) * 1000), duration: Math.round(1e6 / FPS) });
    try {
      const key = this.forceKey || now - this.lastKeyAt >= 1000;
      enc.encode(frame, { keyFrame: key });
      if (key) this.lastKeyAt = now;
      this.forceKey = false;
      this.frames++;
    } finally {
      frame.close();
    }
  }

  private onChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) {
    if (meta?.decoderConfig) this.decoderConfig = meta.decoderConfig;
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    this.chunks.push({ data, key: chunk.type === "key", timestamp: chunk.timestamp, duration: chunk.duration ?? Math.round(1e6 / FPS) });
    this.chunks = pruneChunks(this.chunks, (CLIP_SECONDS + 1) * 1e6);
  }

  /** Throw away what's recorded (a new run starts fresh). */
  reset() {
    this.chunks = [];
    this.forceKey = true;
  }

  /** The last CLIP_SECONDS as an MP4, or null if there's nothing yet. */
  async save(): Promise<Blob | null> {
    if (!this.encoder || this.encoder.state !== "configured") return null;
    await this.encoder.flush();
    this.forceKey = true; // the stream after a flush starts on a keyframe
    const chunks = clipChunks(this.chunks, CLIP_SECONDS * 1e6);
    if (!chunks.length || !this.decoderConfig) return null;
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: this.mux, width: this.canvas.width, height: this.canvas.height, frameRate: FPS },
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
    });
    chunks.forEach((c, i) => muxer.addVideoChunkRaw(c.data, c.key ? "key" : "delta", c.timestamp, c.duration, i === 0 ? { decoderConfig: this.decoderConfig } : undefined));
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: "video/mp4" });
  }

  close() {
    try {
      this.encoder?.close();
    } catch {}
    this.encoder = null;
    this.chunks = [];
  }
}
