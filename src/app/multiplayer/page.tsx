import type { Metadata } from "next";
import { MultiplayerClient } from "@/components/multiplayer/MultiplayerClient";

export const metadata: Metadata = {
  title: "Multiplayer",
  description: "Create or join a room and play AirHoops with friends.",
};

export default function MultiplayerPage() {
  return <MultiplayerClient />;
}
