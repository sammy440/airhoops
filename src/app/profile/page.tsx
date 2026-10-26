import type { Metadata } from "next";
import { ProfileClient } from "@/components/profile/ProfileClient";

export const metadata: Metadata = {
  title: "Your player",
  description: "Pick your name, body, skin tone, hair and kit colours.",
};

export default function ProfilePage() {
  return <ProfileClient />;
}
