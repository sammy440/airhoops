import type { Metadata } from "next";
import { LeaderboardClient } from "@/components/leaderboard/LeaderboardClient";

export const metadata: Metadata = {
  title: "Leaderboards",
  description: "Daily, weekly and all-time AirHoops leaderboards, plus your personal bests.",
};

export default function LeaderboardPage() {
  return <LeaderboardClient />;
}
