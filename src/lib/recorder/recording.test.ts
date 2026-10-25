import { describe, expect, it } from "vitest";
import { buildRecording, countByLabel, RECORDED_LANDMARKS, recordingFilename, toRecordedFrame } from "./recording";

const pose = Array.from({ length: 33 }, (_, i) => ({ x: i / 100 + 0.123456789, y: 0.5, z: -0.1, visibility: 0.98765 }));

describe("recording format", () => {
  it("keeps only the landmarks the lab needs, rounded", () => {
    const f = toRecordedFrame(pose, 12.6);
    expect(f.t).toBe(13);
    expect(f.landmarks.map((l) => l.i)).toEqual([...RECORDED_LANDMARKS]);
    expect(f.landmarks[0]).toEqual({ i: 11, x: 0.2335, y: 0.5, z: -0.1, v: 0.988 });
  });

  it("records an empty frame when no person is visible", () => {
    expect(toRecordedFrame(undefined, 40)).toEqual({ t: 40, landmarks: [] });
  });

  it("computes duration and fps from frame timestamps", () => {
    const frames = Array.from({ length: 31 }, (_, i) => toRecordedFrame(pose, i * 100));
    const r = buildRecording({
      label: "throw",
      hand: "right",
      frames,
      video: { width: 1280, height: 720 },
      model: "lite",
      now: new Date("2026-10-24T09:41:07Z"),
    });
    expect(r.version).toBe(1);
    expect(r.durationMs).toBe(3000);
    expect(r.fps).toBe(10);
    expect(recordingFilename(r)).toMatch(/^throw_2026-10-24_09-41-07_[0-9a-f]{4}\.json$/);
  });

  it("counts recordings per label", () => {
    const base = { frames: [], video: { width: 1, height: 1 }, model: "lite" as const, hand: "left" as const };
    const recs = [buildRecording({ ...base, label: "throw" }), buildRecording({ ...base, label: "throw" }), buildRecording({ ...base, label: "wave" })];
    expect(countByLabel(recs)).toMatchObject({ throw: 2, wave: 1, idle: 0 });
  });
});
