import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveGuest } from "@/lib/net/api";
import { ACHIEVEMENTS, claim, courtFinished, shotMoments, syncAchievements } from "./achievements";

// Same ids, in the same order, as airhoops-backend app/game/achievements.py (tests/test_achievements.py IDS)
const IDS = [
  "first_bucket", "swish_10", "swish_100", "bank_10", "shots_1000", "shots_10000", "streak_5", "streak_10", "streak_20",
  "daily_1", "daily_7", "first_win", "horse_clean", "shootout_perfect", "series_win", "buzzer_beater", "green_light", "world_tour",
];

describe("achievements", () => {
  let earned: string[];
  let claims: string[];

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    earned = [];
    claims = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = new URL(url).pathname;
        if (init?.method === "POST") {
          const id = path.split("/").pop()!;
          if (id === "first_win") return new Response(JSON.stringify({ detail: { code: "not_claimable", message: "" } }), { status: 422 });
          claims.push(id);
          if (!earned.includes(id)) earned.push(id);
          return new Response(JSON.stringify({ id, unlocked_at: "2026-11-07T00:00:00Z", new: true }));
        }
        return new Response(JSON.stringify(earned.map((id) => ({ id, unlocked_at: "2026-11-07T00:00:00Z" }))));
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("has the server's ids", () => {
    expect(ACHIEVEMENTS.map((a) => a.id)).toEqual(IDS);
  });

  it("spots solo moments in a shot", () => {
    expect(shotMoments({ scored: true, swish: false, at: 59.4, seconds: 60 })).toEqual(["buzzer_beater"]);
    expect(shotMoments({ scored: true, swish: false, at: 58.5, seconds: 60 })).toEqual([]);
    expect(shotMoments({ scored: false, swish: false, at: 59.9, seconds: 60 })).toEqual([]);
    expect(shotMoments({ scored: true, swish: false, at: 120 })).toEqual([]); // free play: no buzzer
    expect(shotMoments({ scored: true, swish: true, green: true, at: 3 })).toEqual(["green_light"]);
    expect(shotMoments({ scored: true, swish: true, green: false, at: 3 })).toEqual([]);
  });

  it("knows when every court has had a run", () => {
    for (const c of ["arena", "park", "beach", "rooftop"] as const) expect(courtFinished(c)).toBe(false);
    expect(courtFinished("arena")).toBe(false);
    expect(courtFinished("neon")).toBe(true);
  });

  it("keeps claims until there's a player online, then sends them", async () => {
    await claim(["buzzer_beater"]);
    expect(claims).toEqual([]);
    saveGuest({ token: "tok", user: { id: "u1", nickname: "Ayo" } });
    await syncAchievements();
    expect(claims).toEqual(["buzzer_beater"]);
    await syncAchievements();
    expect(claims).toEqual(["buzzer_beater"]); // sent once
  });

  it("announces only what this device hasn't seen, and nothing on its first look", async () => {
    saveGuest({ token: "tok", user: { id: "u1", nickname: "Ayo" } });
    earned = ["first_bucket", "streak_5"];
    expect(await syncAchievements()).toEqual([]); // an old account isn't re-announced
    earned.push("first_win");
    expect((await syncAchievements()).map((a) => a.id)).toEqual(["first_win"]);
    expect(await syncAchievements()).toEqual([]);
  });

  it("drops a claim the server refuses", async () => {
    saveGuest({ token: "tok", user: { id: "u1", nickname: "Ayo" } });
    await claim(["first_win" as never]);
    await syncAchievements();
    expect(JSON.parse(localStorage.getItem("airhoops.claims")!)).toEqual([]);
  });
});
