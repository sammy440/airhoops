import type { Metadata } from "next";
import { PlayClient } from "@/components/play/PlayClient";

export const metadata: Metadata = {
  title: "Play",
  description: "Shoot hoops with nothing but air. Throw on camera and watch the ball fly.",
};

export default function PlayPage() {
  return <PlayClient />;
}
