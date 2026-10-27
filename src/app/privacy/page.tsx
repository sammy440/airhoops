import type { Metadata } from "next";
import { PrivacyPage } from "@/components/privacy/PrivacyPage";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Your camera video never leaves your device. Here is exactly what AirHoops stores, where, and how to delete it.",
};

export default function Page() {
  return <PrivacyPage />;
}
