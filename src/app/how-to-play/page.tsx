import type { Metadata } from "next";
import { HowToPlay } from "@/components/howto/HowToPlay";

export const metadata: Metadata = {
  title: "How to play",
  description: "Set up your camera, light your room and nail the set-and-push shot: everything you need to play AirHoops with your body.",
};

export default function Page() {
  return <HowToPlay />;
}
