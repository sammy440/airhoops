import { describe, expect, it } from "vitest";
import { clipChunks, clipSize, pruneChunks, type Chunk } from "./clipRecorder";

/** One chunk every 100 ms for `seconds`, a keyframe each second. */
const stream = (seconds: number): Chunk[] =>
  Array.from({ length: seconds * 10 }, (_, i) => ({ data: new Uint8Array(1), key: i % 10 === 0, timestamp: i * 100_000, duration: 100_000 }));

describe("clip buffer", () => {
  it("keeps only what a clip can use, starting on a keyframe", () => {
    const kept = pruneChunks(stream(20), 8e6);
    expect(kept[0].key).toBe(true);
    expect(kept[0].timestamp).toBe(11e6); // newest is 19.9 s: the last keyframe at or before 11.9 s
    expect(kept[kept.length - 1].timestamp).toBe(19.9e6);
  });

  it("a clip starts on the last keyframe before the window, so it's never short", () => {
    const c = clipChunks(stream(20), 8e6);
    expect(c[0]).toMatchObject({ key: true, timestamp: 11e6 });
  });

  it("with keyframes far apart (a slow device), still the whole window, not just the newest frame", () => {
    const sparse = stream(20).map((c) => ({ ...c, key: c.timestamp % 10e6 === 0 }));
    expect(clipChunks(sparse, 8e6)[0].timestamp).toBe(10e6);
  });

  it("a short recording gives what there is", () => {
    expect(clipChunks(stream(3), 8e6)[0].timestamp).toBe(0);
    expect(clipChunks([], 8e6)).toEqual([]);
  });

  it("sizes the clip to fit 1280 with even sides", () => {
    expect(clipSize(1920, 1080)).toEqual({ width: 1280, height: 720 });
    expect(clipSize(390, 845)).toEqual({ width: 390, height: 846 });
  });
});
