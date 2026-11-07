import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveGuest } from "@/lib/net/api";
import { pushBest, syncBests } from "./cloudBests";
import { loadGhost, saveGhost, type GhostShot } from "./ghostRun";
import { beats, loadBests, putBest } from "./modes";

const NOW = new Date("2026-11-06T12:00:00Z");
const AT = "2026-11-01T10:00:00.000Z";
const shot = (points: number, t = 2): GhostShot => ({ t, speed: 7, angle: 52, aim: 0, wind: 0, phase: 1, points });

/** A fake API: GET /me/bests, GET …/ghost, PUT /me/bests/{key} (keeps the better, like the server). */
function fakeServer(remote: Record<string, { points: number; makes: number; streak: number; at: string; ghost?: GhostShot[] }>) {
  const puts: { key: string; body: { points: number; ghost?: GhostShot[] } }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (path === "/me/bests") return json(Object.fromEntries(Object.entries(remote).map(([k, b]) => [k, { ...b, ghost: undefined, has_ghost: !!b.ghost }])));
    const key = decodeURIComponent(path.split("/")[3]);
    if (path.endsWith("/ghost")) return remote[key]?.ghost ? json(remote[key].ghost) : json({ detail: { code: "no_ghost", message: "" } }, 404);
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      if (body.ghost?.some((s: GhostShot) => s.points === 99)) return json({ detail: { code: "implausible_best", message: "" } }, 422);
      puts.push({ key, body });
      remote[key] = body;
      return json({ ...body, has_ghost: !!body.ghost, updated: true });
    }
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { puts, remote };
}

describe("bests that follow you", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    saveGuest({ token: "tok", user: { id: "u1", nickname: "Ayo" } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("compares on points, or on the streak for streak boards, with makes breaking ties", () => {
    expect(beats("timed60:rookie", { points: 10, makes: 3, streak: 1 }, { points: 9, makes: 5, streak: 5 })).toBe(true);
    expect(beats("timed60:rookie", { points: 10, makes: 4, streak: 1 }, { points: 10, makes: 3, streak: 1 })).toBe(true);
    expect(beats("timed60:rookie", { points: 10, makes: 3, streak: 1 }, { points: 10, makes: 3, streak: 1 })).toBe(false);
    expect(beats("streak:rookie", { points: 10, makes: 3, streak: 3 }, { points: 40, makes: 9, streak: 2 })).toBe(true);
    expect(beats("timed60:rookie", { points: 0, makes: 0, streak: 0 }, undefined)).toBe(true);
  });

  it("brings the account's better bests and ghosts down", async () => {
    fakeServer({ "timed60:rookie": { points: 12, makes: 4, streak: 2, at: AT, ghost: [shot(3), shot(3, 4), shot(3, 6), shot(3, 8)] } });
    putBest("timed60:rookie", { points: 6, makes: 2, streak: 2, at: AT });
    expect(await syncBests(NOW)).toBe(true);
    expect(loadBests()["timed60:rookie"]).toMatchObject({ points: 12, makes: 4 });
    expect(loadGhost("timed60:rookie")?.shots).toHaveLength(4);
  });

  it("sends this device's better bests up, with their ghost", async () => {
    const { puts } = fakeServer({ "streak:starter": { points: 30, makes: 8, streak: 8, at: AT } });
    putBest("timed60:rookie", { points: 6, makes: 2, streak: 2, at: AT });
    saveGhost("timed60:rookie", { points: 6, shots: [shot(3), shot(3, 4)] });
    putBest("streak:starter", { points: 50, makes: 10, streak: 6, at: AT }); // more points, shorter streak: the account's is better
    expect(await syncBests(NOW)).toBe(true);
    expect(puts.map((p) => p.key)).toEqual(["timed60:rookie"]);
    expect(loadBests()["streak:starter"]).toMatchObject({ streak: 8 });
    expect(puts[0].body.ghost).toHaveLength(2);
  });

  it("leaves a ghost behind if it doesn't belong to the best, or the server won't take it", async () => {
    const { puts } = fakeServer({});
    putBest("timed30:legend", { points: 9, makes: 3, streak: 3, at: AT });
    saveGhost("timed30:legend", { points: 7, shots: [shot(7)] }); // an older best's ghost
    putBest("timed90:legend", { points: 99, makes: 1, streak: 1, at: AT });
    saveGhost("timed90:legend", { points: 99, shots: [shot(99)] }); // refused by the server
    await syncBests(NOW);
    expect(puts.find((p) => p.key === "timed30:legend")?.body.ghost).toBeUndefined();
    expect(puts.find((p) => p.key === "timed90:legend")?.body).toMatchObject({ points: 99 });
    expect(puts.find((p) => p.key === "timed90:legend")?.body.ghost).toBeUndefined();
  });

  it("skips old dailies and keys the account doesn't know", async () => {
    const { puts } = fakeServer({});
    putBest("daily20261001", { points: 9, makes: 3, streak: 3, at: AT });
    putBest("daily", { points: 9, makes: 3, streak: 3, at: AT });
    putBest("daily20261105", { points: 9, makes: 3, streak: 3, at: AT });
    await syncBests(NOW);
    expect(puts.map((p) => p.key)).toEqual(["daily20261105"]);
  });

  it("does nothing without a player online, and pushes a new best after a run", async () => {
    const { puts } = fakeServer({});
    saveGuest(null);
    putBest("free:rookie", { points: 30, makes: 10, streak: 4, at: AT });
    expect(await syncBests(NOW)).toBe(false);
    await pushBest("free:rookie");
    expect(puts).toEqual([]);
    saveGuest({ token: "tok", user: { id: "u1", nickname: "Ayo" } });
    await pushBest("free:rookie");
    expect(puts.map((p) => p.key)).toEqual(["free:rookie"]);
  });
});
