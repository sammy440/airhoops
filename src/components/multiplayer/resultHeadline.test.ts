import { describe, expect, it } from "vitest";
import { resultHeadline } from "./resultHeadline";

const names = { a: "Ada", b: "Bo", c: "Cy" };
const end = (winners: string[], reason: "complete" | "time" | "forfeit" | "aborted" = "time") => ({
  winner: winners.length === 1 ? winners[0] : null,
  winners,
  reason,
  standings: ["a", "b", "c"].map((playerId) => ({ playerId })),
});

describe("result headline", () => {
  it("tells the winner they won and the others they lost (not who won)", () => {
    expect(resultHeadline(end(["a"]), "a", names)).toBe("You win!");
    expect(resultHeadline(end(["a"]), "b", names)).toBe("You lost");
    expect(resultHeadline(end(["a"], "forfeit"), "c", names)).toBe("You lost");
  });

  it("ties: a shared win for those in it, a loss for the rest", () => {
    expect(resultHeadline(end(["a", "b"]), "b", names)).toBe("Shared win!");
    expect(resultHeadline(end(["a", "b"]), "c", names)).toBe("You lost");
  });

  it("someone who didn't play is told who won", () => {
    expect(resultHeadline(end(["a"]), "zz", names)).toBe("Ada wins");
    expect(resultHeadline(end(["a", "b"]), "zz", names)).toBe("It's a draw");
  });

  it("an ended match is just over", () => {
    expect(resultHeadline(end([], "aborted"), "a", names)).toBe("Match ended");
  });
});
