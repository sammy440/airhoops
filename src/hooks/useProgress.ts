"use client";

import { useEffect, useState } from "react";
import { usableLoadout } from "@/lib/game/cosmetics";
import { loadProgress, onProgress, shownXp, syncProgress, type Progress } from "@/lib/game/progress";
import { levelProgress } from "@/lib/game/xp";

/** Your XP, level and loadout, kept current (and synced with your account once on mount). */
export function useProgress() {
  const [progress, setProgress] = useState<Progress | null>(null);
  useEffect(() => {
    const read = () => setProgress(loadProgress());
    read();
    void syncProgress();
    return onProgress(read);
  }, []);
  if (!progress) return null;
  const xp = shownXp(progress);
  const level = levelProgress(xp);
  return { xp, ...level, loadout: usableLoadout(progress.loadout, level.level), chosen: progress.loadout };
}
