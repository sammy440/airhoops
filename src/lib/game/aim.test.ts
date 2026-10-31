import { describe, expect, it } from "vitest";
import expected from "@/lib/pose/__fixtures__/expected-events.json";
import { AimCenter, LEAN_DEADZONE, leanAim, MAX_LEAN_AIM } from "./aim";

describe("leanAim", () => {
  it("is straight inside the dead zone, and signed outside it", () => {
    expect(leanAim(-0.05 + LEAN_DEADZONE * 0.9, -0.05)).toBe(0);
    expect(leanAim(-0.05 - LEAN_DEADZONE * 0.9, -0.05)).toBe(0);
    // The player's right is the image's left: shoulders moving to lower image x = leaning right
    expect(leanAim(-0.1, -0.05)).toBeGreaterThan(2);
    expect(leanAim(0, -0.05)).toBeLessThan(-2);
  });

  it("is capped, and straight without a lean reading", () => {
    expect(leanAim(-1, 0)).toBe(MAX_LEAN_AIM);
    expect(leanAim(1, 0)).toBe(-MAX_LEAN_AIM);
    expect(leanAim(null, 0)).toBe(0);
  });
});

describe("AimCenter", () => {
  it("uses calibration when there is one", () => {
    const c = new AimCenter(-0.05);
    c.observe(0.2);
    expect(c.value).toBe(-0.05);
  });

  it("otherwise starts at the first throw and follows slowly", () => {
    const c = new AimCenter();
    expect(c.value).toBe(0);
    c.observe(-0.05);
    expect(c.value).toBe(-0.05);
    c.observe(0.05); // one aimed shot
    expect(c.value).toBeCloseTo(-0.03, 6);
  });
});

describe("leanAim on the lab's lean recordings", () => {
  // Oct 31: throw-straight and two lean clips. Which way each lean went is unclear (the labels likely follow the
  // mirrored preview), so this checks they aim consistently and in opposite directions.
  const leans = (prefix: string) =>
    expected.clips.find((c) => c.id.startsWith(prefix))!.events.map((e) => e.lean).filter((l): l is number => l !== null);
  const straight = leans("dc7dcd");
  const center = [...straight].sort((a, b) => a - b)[Math.floor(straight.length / 2)];

  it("keeps most straight throws within a make (±1.3°)", () => {
    expect(straight.filter((l) => Math.abs(leanAim(l, center)) <= 1.3).length).toBeGreaterThanOrEqual(straight.length - 1);
  });

  it("aims each lean clip one way, consistently, and the two clips opposite ways", () => {
    const a = leans("95862c").map((l) => leanAim(l, center));
    const b = leans("e0abe0").map((l) => leanAim(l, center));
    expect(a.filter((x) => x > 1).length / a.length).toBeGreaterThanOrEqual(0.8);
    expect(b.every((x) => x < -1)).toBe(true);
  });
});
