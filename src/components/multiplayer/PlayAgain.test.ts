import { describe, expect, it } from "vitest";
import type { HistoryMatch, HistoryPlayer } from "@/lib/net/api";
import { recentOpponents } from "./PlayAgain";

const p = (user_id: string, rank: number): HistoryPlayer => ({
  user_id, nickname: user_id, rank, won: rank === 1, forfeited: false, points: 0, shots: 0, makes: 0, swishes: 0, banks: 0, best_streak: 0, letters: null,
});
const match = (id: string, players: HistoryPlayer[], reason = "time"): HistoryMatch => ({
  id, mode: "race", difficulty: "starter", race_seconds: 60, started_at: "", ended_at: "", reason, you: players.find((x) => x.user_id === "me")!, players,
});

describe("recent opponents", () => {
  it("lists each opponent once, most recent first, with your record by finishing place", () => {
    const history = [
      match("m3", [p("ada", 1), p("me", 2), p("bayo", 3)]),
      match("m2", [p("me", 1), p("ada", 2)]),
      match("m1", [p("me", 1), p("chi", 2)], "aborted"),
    ];
    const o = recentOpponents(history, "me");
    expect(o.map((x) => [x.player.user_id, x.played, x.wins, x.last.id])).toEqual([
      ["ada", 2, 1, "m3"],
      ["bayo", 1, 1, "m3"],
      ["chi", 1, 0, "m1"], // aborted: played, but nobody won
    ]);
  });

  it("keeps the list short", () => {
    const history = Array.from({ length: 10 }, (_, i) => match(`m${i}`, [p("me", 1), p(`x${i}`, 2)]));
    expect(recentOpponents(history, "me")).toHaveLength(6);
  });
});
