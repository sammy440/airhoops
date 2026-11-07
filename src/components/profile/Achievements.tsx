"use client";

import { useEffect, useState } from "react";
import { ACHIEVEMENTS, syncAchievements, type AchievementGroup } from "@/lib/game/achievements";
import { api, loadGuest } from "@/lib/net/api";

const GROUPS: AchievementGroup[] = ["Shooting", "Streaks", "Daily", "Multiplayer", "Moments"];

/** Every achievement: earned ones with their date, the rest greyed with how to get them. */
export function Achievements() {
  const [earned, setEarned] = useState<Record<string, string> | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const guest = loadGuest();
    if (!guest) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage
      setOnline(false);
      return;
    }
    let live = true;
    // Sends any moments claimed while offline first
    syncAchievements()
      .then(() => api.myAchievements(guest.token))
      .then((list) => live && setEarned(Object.fromEntries(list.map((a) => [a.id, a.unlocked_at]))))
      .catch(() => live && setEarned({}));
    return () => {
      live = false;
    };
  }, []);

  const count = earned ? ACHIEVEMENTS.filter((a) => earned[a.id]).length : 0;
  return (
    <section id="achievements" className="scroll-mt-6 rounded-3xl border border-ink/10 bg-card p-5 sm:p-6">
      <h2 className="display text-2xl">Achievements</h2>
      <p className="mb-4 text-xs text-ink/55">
        {online ? `${count} of ${ACHIEVEMENTS.length} earned` : "Earned with a player online: play multiplayer or sign in with Google."}
      </p>
      {GROUPS.map((g) => (
        <div key={g} className="mt-4 first:mt-0">
          <h3 className="mb-2 text-xs font-semibold text-ink/55">{g}</h3>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ACHIEVEMENTS.filter((a) => a.group === g).map((a) => {
              const at = earned?.[a.id];
              return (
                <li key={a.id} className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${at ? "border-ink/15" : "border-ink/5 bg-paper/60"}`}>
                  <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full text-lg ${at ? "bg-sun/25" : "bg-ink/5 opacity-40 grayscale"}`}>
                    {a.icon}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${at ? "" : "text-ink/50"}`}>
                      {a.name}
                      <span className="sr-only">{at ? ", earned" : ", not earned yet"}</span>
                    </p>
                    <p className="truncate text-xs text-ink/55">
                      {a.how}
                      {at && <span className="text-ink/40"> · {new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
