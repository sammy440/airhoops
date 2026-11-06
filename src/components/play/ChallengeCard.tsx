"use client";

import { Cancel01Icon, ChampionIcon, Share08Icon, SwordIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { IconButton } from "@/components/ui/Pills";
import { CHALLENGE_PARAM, challengeMargin, encodeChallenge, type Challenge } from "@/lib/game/challenge";
import { DIFFICULTIES } from "@/lib/game/difficulty";
import { formatDuration } from "@/lib/game/modes";
import { shareLink, siteUrl } from "@/lib/share";

const who = (c: Challenge) => c.name || "Your friend";
const settings = (c: Challenge) => `${c.mode === "daily" ? "Daily" : "Timed"} · ${formatDuration(c.seconds)} · ${DIFFICULTIES[c.difficulty].name}`;

/** Start menu: a friend's challenge, ready to race (or its settings to put back, or why it can't be). */
export function ChallengeBanner(p: { challenge: Challenge | null; note: string | null; active: boolean; onUse: () => void; onDismiss: () => void }) {
  const c = p.challenge;
  if (!c && !p.note) return null;
  return (
    <div className="relative mt-4 flex items-start gap-3 rounded-[1.5rem] bg-ink p-4 pr-12 text-cream" role="status">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-hoop">
        <HugeiconsIcon icon={SwordIcon} size={17} />
      </span>
      {c ? (
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {who(c)} challenged you: beat <span className="font-mono tabular-nums">{c.points}</span>
          </p>
          <p className="mt-0.5 text-xs text-cream/60">
            {settings(c)}
            {p.active ? " · their ball flies beside yours" : ""}
          </p>
          {!p.active && (
            <button type="button" onClick={p.onUse} className="mt-2 rounded-full bg-cream px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-white">
              Use their settings
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-cream/80">{p.note}</p>
      )}
      <IconButton icon={Cancel01Icon} label="Dismiss challenge" tone="glass" size={30} onClick={p.onDismiss} className="absolute top-3 right-3" />
    </div>
  );
}

/** Game over: how the race against a friend went, and the button that sends this run as a challenge. */
export function ChallengeResult({ raced, mine, points, className = "" }: { raced: Challenge | null; mine: Challenge | null; points: number; className?: string }) {
  const [sent, setSent] = useState<"shared" | "copied" | "failed" | null>(null);
  if (!raced && !mine) return null;
  const margin = raced ? challengeMargin(raced, points) : 0;

  const send = async () => {
    if (!mine) return;
    const url = `${siteUrl()}/play?${CHALLENGE_PARAM}=${encodeChallenge(mine)}`;
    const text = raced
      ? margin > 0
        ? `I beat your ${raced.points} with ${points} on AirHoops 🏀 Your move:`
        : `${points} on AirHoops 🏀 Rematch, beat this:`
      : `I scored ${points} on AirHoops 🏀 Beat it, using only your arms:`;
    setSent(await shareLink({ title: "AirHoops challenge", text, url }));
  };

  return (
    <div className={`overflow-hidden rounded-[1.5rem] bg-card ${className}`}>
      {raced && (
        <div className="flex items-center gap-3 p-4">
          <span className={`grid size-9 shrink-0 place-items-center rounded-full ${margin > 0 ? "bg-good text-ink" : "bg-ink text-cream"}`}>
            <HugeiconsIcon icon={margin > 0 ? ChampionIcon : SwordIcon} size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {margin > 0 ? `You beat ${who(raced)} by ${margin}` : margin < 0 ? `${who(raced)} wins by ${-margin}` : `Dead heat with ${who(raced)}`}
            </p>
            <p className="text-xs text-stone">
              <span className="font-mono tabular-nums">{points}</span> vs <span className="font-mono tabular-nums">{raced.points}</span>
            </p>
          </div>
        </div>
      )}
      {mine && (
        <button
          type="button"
          onClick={() => void send()}
          className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium transition hover:bg-cream ${raced ? "border-t border-ink/10" : ""}`}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-hoop text-cream">
            <HugeiconsIcon icon={sent === "shared" || sent === "copied" ? Tick02Icon : Share08Icon} size={17} />
          </span>
          <span className="min-w-0 flex-1">
            {raced ? (margin > 0 ? "Send it back" : "Ask for a rematch") : "Challenge a friend"}
            <span className="block text-xs font-normal text-stone" aria-live="polite">
              {sent === "copied" ? "Link copied: paste it anywhere" : sent === "shared" ? "Sent" : sent === "failed" ? "Couldn't share. Try again" : "They race this run, shot for shot"}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
