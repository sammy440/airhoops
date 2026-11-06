import { describe, expect, it } from "vitest";
import { decodeChallenge, encodeChallenge, type Challenge } from "./challenge";
import { courtFor, DIFFICULTIES } from "./difficulty";
import { GhostPlayer } from "./ghostRun";
import { idealSpeed, simulateShot } from "./physics";

const court = courtFor(DIFFICULTIES.allstar);
const v = idealSpeed(52, court)!;

/** A minute of shooting: one every two seconds, some made, some not, odd decimals throughout. */
const shots = Array.from({ length: 30 }, (_, i) => {
  const speed = v + (i % 3 === 0 ? 0.6 : 0.0123 * (i % 5));
  const made = simulateShot({ speed, angle: 52.3456, aim: 0.111 }, court, { wind: 0.0234 * (i % 4), phase: i * 2.0137 }).result.scored;
  return { t: i * 2.0137, speed, angle: 52.3456, aim: 0.111, wind: 0.0234 * (i % 4), phase: i * 2.0137, points: made ? 2 : 0 };
});

const sent: Challenge = {
  name: "Ayọ 🏀",
  mode: "timed",
  seconds: 60,
  difficulty: "allstar",
  court: "rooftop",
  daily: null,
  points: shots.reduce((a, s) => a + s.points, 0),
  shots,
};

describe("challenge links", () => {
  it("round-trips a run, names with accents and emoji included", () => {
    const got = decodeChallenge(encodeChallenge(sent))!;
    expect(got).toMatchObject({ name: "Ayọ 🏀", mode: "timed", seconds: 60, difficulty: "allstar", court: "rooftop", daily: null, points: sent.points });
    expect(got.shots).toHaveLength(30);
    got.shots.forEach((s, i) => expect(s.speed).toBeCloseTo(shots[i].speed, 3));
  });

  it("flies the same race on the other end: every shot lands the same way and the scores match", () => {
    const got = decodeChallenge(encodeChallenge(sent))!;
    const a = new GhostPlayer(sent, court);
    const b = new GhostPlayer(got, court);
    for (let t = 0; t <= 62; t += 0.5) expect(b.pointsAt(t)).toBe(a.pointsAt(t));
    got.shots.forEach((s, i) => {
      const was = simulateShot({ speed: shots[i].speed, angle: shots[i].angle, aim: shots[i].aim }, court, { wind: shots[i].wind, phase: shots[i].phase });
      const now = simulateShot({ speed: s.speed, angle: s.angle, aim: s.aim }, court, { wind: s.wind, phase: s.phase });
      expect(now.result.scored).toBe(was.result.scored);
    });
  });

  it("tests a race with makes and misses in it", () => {
    const made = shots.filter((s) => s.points).length;
    expect(made).toBeGreaterThan(3);
    expect(made).toBeLessThan(27);
  });

  it("fits in a link people can paste anywhere", () => {
    expect(encodeChallenge(sent).length).toBeLessThan(2000);
    expect(encodeChallenge(sent)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("keeps a daily's day", () => {
    const got = decodeChallenge(encodeChallenge({ ...sent, mode: "daily", daily: "daily20261106" }))!;
    expect(got).toMatchObject({ mode: "daily", daily: "daily20261106" });
  });

  it("refuses garbage and tampering", () => {
    const wire = (o: object) => btoa(JSON.stringify({ v: 1, n: "x", m: "t", s: 60, d: "allstar", c: "park", p: 0, x: [], ...o }));
    expect(decodeChallenge(wire({}))).not.toBeNull();
    for (const bad of [null, "", "not base64!", btoa("{}"), wire({ v: 2 }), wire({ d: "godmode" }), wire({ s: 7 }), wire({ p: -1 }), wire({ m: "d" }), wire({ x: [[1, 2]] }), wire({ x: [[0, 0, 0, 0, 0, 0, 0]] })]) {
      expect(decodeChallenge(bad)).toBeNull();
    }
  });

  it("trims long names and strips control characters", () => {
    expect(decodeChallenge(encodeChallenge({ ...sent, name: "\u0007a".padEnd(40, "b") }))!.name).toHaveLength(20);
  });
});
