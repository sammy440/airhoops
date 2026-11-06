import type { MatchEnd } from "@/lib/net/socket";

/**
 * The end-of-match headline, said to the player: "You win!" or "You lost". Only someone who
 * didn't play (not in the standings) is told who won.
 */
export function resultHeadline(
  result: Pick<MatchEnd, "winner" | "winners" | "reason"> & { standings: { playerId: string }[] },
  you: string,
  names: Record<string, string>,
) {
  if (result.reason === "aborted") return "Match ended";
  if (result.winners.includes(you)) return result.winners.length > 1 ? "Shared win!" : "You win!";
  if (result.standings.some((r) => r.playerId === you)) return "You lost";
  return result.winners.length > 1 ? "It's a draw" : `${names[result.winner ?? ""] ?? "Someone"} wins`;
}
