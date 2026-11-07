"use client";

import {
  Alert02Icon,
  ArmchairIcon,
  Basketball01Icon,
  BookOpen01Icon,
  Calendar03Icon,
  Camera01Icon,
  CameraOff01Icon,
  Cancel01Icon,
  ChampionIcon,
  CubeIcon,
  DashboardSpeed01Icon,
  Delete02Icon,
  Film01Icon,
  FireIcon,
  GhostIcon,
  Home01Icon,
  KeyboardIcon,
  Layout01Icon,
  Loading03Icon,
  Notification01Icon,
  PencilEdit02Icon,
  PlayIcon,
  RepeatIcon,
  Settings02Icon,
  Share08Icon,
  Target02Icon,
  Tick02Icon,
  Timer02Icon,
  VideoReplayIcon,
  VolumeHighIcon,
  VolumeOffIcon,
  WavingHand01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AvatarCanvas } from "@/components/ui/AvatarCanvas";
import { CourtPreview } from "@/components/ui/CourtPreview";
import { XpBar, XpSummary } from "@/components/ui/Level";
import { ArrowButton, IconButton, IconLink, Tag } from "@/components/ui/Pills";
import { ShotClockPicker } from "@/components/ui/ShotClockPicker";
import { ShareCardButton } from "@/components/ui/ShareCardButton";
import type { LightingStatus } from "@/hooks/useLighting";
import { COURT_THEME_ORDER, COURT_THEMES, type CourtThemeId } from "@/lib/game/courts";
import { webglAvailable, type RendererId } from "@/lib/game/createGame";
import { CALIBRATION_THROWS, consistency, type Calibration } from "@/lib/game/calibration";
import { dailyLabel, msUntilNextDaily, type DailyRules } from "@/lib/game/daily";
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId } from "@/lib/game/difficulty";
import {
  formatDuration,
  MODES,
  MODE_ORDER,
  type Best,
  type ModeId,
} from "@/lib/game/modes";
import { loadProfile } from "@/lib/game/avatar";
import type { Challenge } from "@/lib/game/challenge";
import type { CoachReport } from "@/lib/game/coach";
import type { Tally } from "@/lib/game/scoring";
import type { RunSubmission } from "@/lib/net/api";
import type { ResultCardData } from "@/lib/resultCard";
import { CLIP_SECONDS, clipsSupported } from "@/lib/clips/clipRecorder";
import { shareFile, siteUrl } from "@/lib/share";
import { LeaderboardPost } from "./LeaderboardPost";
import { ChallengeBanner, ChallengeResult } from "./ChallengeCard";
import { ShotCoach } from "./ShotCoach";
import type { BodyOptions, FramingIssue } from "@/lib/pose/landmarks";

/* ───────── Shared shells ───────── */

/** A light card in the middle of the screen, over a dimmed court. */
export function Modal({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      className="absolute inset-0 z-30 flex flex-col items-center overflow-y-auto overscroll-contain bg-ink/45 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-label={label}
    >
      <div className="my-auto w-full max-w-md min-w-0 rounded-[1.75rem] bg-paper p-5 text-ink shadow-2xl sm:p-7">{children}</div>
    </div>
  );
}

/**
 * The left drawer: almost the full height of the screen, with its own scroll and a footer that
 * stays put (the main action is always in reach). The court stays visible on the right.
 */
function Drawer({ children, footer, label }: { children: ReactNode; footer: ReactNode; label: string }) {
  return (
    <div className="absolute inset-0 z-30 bg-gradient-to-r from-ink/55 via-ink/25 to-transparent" role="dialog" aria-modal aria-label={label}>
      <div className="animate-drawer-in absolute inset-y-2 left-2 flex w-[calc(100%-1rem)] flex-col overflow-hidden rounded-[1.75rem] bg-paper text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,.6)] sm:inset-y-3 sm:left-3 sm:w-[30rem]">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-6 sm:px-6 sm:pt-5">{children}</div>
        <div className="border-t border-rule bg-paper px-4 py-3 sm:px-6 sm:py-4">{footer}</div>
      </div>
    </div>
  );
}

/** A section heading inside a menu: an icon and a word. */
function Label({ icon, children, aside }: { icon: IconSvgElement; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-xs font-medium text-ink/60">
        <HugeiconsIcon icon={icon} size={14} />
        {children}
      </span>
      {aside && <span className="truncate text-[11px] text-stone">{aside}</span>}
    </div>
  );
}

/** An on/off setting shown as an icon tile; the label sits under the icon. */
function ToggleTile({ icon, offIcon, label, on, onChange }: { icon: IconSvgElement; offIcon?: IconSvgElement; label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      title={label}
      className={`relative flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center text-[11px] leading-tight transition ${
        on ? "bg-ink text-cream" : "bg-card text-ink/60 hover:text-ink"
      }`}
    >
      <HugeiconsIcon icon={on ? icon : (offIcon ?? icon)} size={20} strokeWidth={1.8} />
      <span className="line-clamp-2">{label}</span>
      <span className={`absolute top-2 right-2 size-1.5 rounded-full ${on ? "bg-good" : "bg-ink/15"}`} aria-hidden />
    </button>
  );
}

/** Segmented control: one choice from a few, the chosen one in black. */
function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; icon?: IconSvgElement }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="grid gap-1 rounded-full bg-card p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-medium transition ${value === o.id ? "bg-ink text-cream" : "text-ink/65 hover:text-ink"}`}
        >
          {o.icon && <HugeiconsIcon icon={o.icon} size={14} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A big round action with a short caption under it (menus with several actions). */
function RoundAction({ icon, label, onClick, href, tone = "light" }: { icon: IconSvgElement; label: string; onClick?: () => void; href?: string; tone?: "light" | "dark" | "clay" }) {
  const circle = { light: "bg-card text-ink group-hover:bg-ink group-hover:text-cream", dark: "bg-ink text-cream group-hover:bg-hoop", clay: "bg-hoop text-cream group-hover:bg-hoop-soft" }[tone];
  const inner = (
    <>
      <span className={`grid size-14 place-items-center rounded-full transition ${circle}`}>
        <HugeiconsIcon icon={icon} size={22} strokeWidth={1.8} />
      </span>
      <span className="text-[11px] leading-tight text-ink/65">{label}</span>
    </>
  );
  const cls = "group flex flex-col items-center gap-1.5 text-center";
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/* ───────── Clip ───────── */

export type ClipState = { status: "making" } | { status: "ready"; blob: Blob; url: string } | { status: "empty" };

/** The clip just saved: a looping preview, then share or download. */
export function ClipDialog({ clip, onClose }: { clip: ClipState; onClose: () => void }) {
  const [result, setResult] = useState<string | null>(null);
  const filename = `airhoops-clip-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.mp4`;
  const share = async () => {
    if (clip.status !== "ready") return;
    const r = await shareFile(clip.blob, { filename, title: "AirHoops", text: `Check this shot 🏀 ${siteUrl()}/play` });
    setResult(r === "shared" ? "Shared!" : r === "saved" ? "Saved to your downloads" : null);
  };
  return (
    <Modal label="Your clip">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Tag>
            <HugeiconsIcon icon={Film01Icon} size={12} /> Your clip
          </Tag>
          <h2 className="display mt-3 text-3xl">The last {CLIP_SECONDS} seconds</h2>
        </div>
        <IconButton icon={Cancel01Icon} label="Back to the game" onClick={onClose} />
      </div>
      <div className="mt-4 grid aspect-video place-items-center overflow-hidden rounded-2xl bg-ink text-cream">
        {clip.status === "ready" ? (
          <video src={clip.url} autoPlay loop muted playsInline controls className="h-full w-full object-contain" />
        ) : clip.status === "making" ? (
          <HugeiconsIcon icon={Loading03Icon} size={28} className="animate-spin opacity-60" aria-label="Making your clip" />
        ) : (
          <p className="px-6 text-center text-sm text-cream/60">Nothing recorded yet. Take a few shots first.</p>
        )}
      </div>
      <p className="mt-2 text-xs text-stone">Made on this device. Nothing is uploaded unless you share it. No sound.</p>
      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-xs text-good" aria-live="polite">
          {result}
        </span>
        <ArrowButton icon={Share08Icon} onClick={share} disabled={clip.status !== "ready"}>
          Share clip
        </ArrowButton>
      </div>
    </Modal>
  );
}

/* ───────── Court picker ───────── */

function CourtPicker({ value, onChange }: { value: CourtThemeId; onChange: (t: CourtThemeId) => void }) {
  const rowRef = useRef<HTMLDivElement>(null);
  // The row scrolls: start with the chosen court in view (without scrolling the page).
  useEffect(() => {
    const row = rowRef.current;
    const on = row?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!row || !on || row.scrollWidth <= row.clientWidth) return;
    row.scrollLeft = on.offsetLeft - row.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
    // Only on open: scrolling while someone taps through the row would fight them.
  }, []);
  return (
    <div>
      <Label icon={Basketball01Icon} aside={COURT_THEMES[value].blurb}>
        Court
      </Label>
      <div ref={rowRef} className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 py-1.5 sm:-mx-6 sm:scroll-px-6 sm:px-6" role="radiogroup" aria-label="Court">
        {COURT_THEME_ORDER.map((id) => {
          const on = id === value;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={COURT_THEMES[id].name}
              onClick={() => onChange(id)}
              className={`relative w-28 shrink-0 snap-start overflow-hidden rounded-2xl ring-2 ring-offset-2 ring-offset-paper transition ${on ? "ring-ink" : "ring-transparent hover:ring-ink/25"}`}
            >
              <CourtPreview theme={id} className="block aspect-[4/3] w-full" />
              <span className="absolute inset-x-1 bottom-1 truncate rounded-lg bg-ink/60 px-1.5 py-0.5 text-[10px] text-cream backdrop-blur">{COURT_THEMES[id].name}</span>
              {on && (
                <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-cream text-ink">
                  <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2.4} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────── Start menu ───────── */

const HOW_TO: [IconSvgElement, string, string][] = [
  [Camera01Icon, "Step back", "Head, shoulders and hips in the camera."],
  [Basketball01Icon, "Hold it high", "Both hands up, like the ball is above your head."],
  [Target02Icon, "Pause", "A beat of stillness is your set point. The ball glows yellow."],
  [PlayIcon, "Push up and out", "Your normal push scores once calibrated. Harder = longer."],
  [FireIcon, "Heat up (optional)", "Dribble at your waist in a steady rhythm, then shoot: a hot hand scores one tier higher."],
];

const MODE_ICON: Record<ModeId, IconSvgElement> = { daily: Calendar03Icon, free: Basketball01Icon, timed: Timer02Icon, streak: FireIcon };

export function StartMenu(p: {
  /** A friend's challenge link: who to beat, whether its settings are picked, or why it can't be raced */
  challenge: { vs: Challenge | null; note: string | null; active: boolean; onUse: () => void; onDismiss: () => void };
  firstTime: boolean;
  mode: ModeId;
  difficulty: DifficultyId;
  timedSeconds: number;
  daily: DailyRules;
  courtTheme: CourtThemeId;
  renderer: RendererId;
  onRenderer: (r: RendererId) => void;
  replays: boolean;
  onReplays: (on: boolean) => void;
  ghost: boolean;
  onGhost: (on: boolean) => void;
  /** Green rim sound cues (camera play only, where the green rim is) */
  greenSound: boolean;
  onGreenSound: (on: boolean) => void;
  clips: { record: boolean; camera: boolean };
  onClips: (c: { record: boolean; camera: boolean }) => void;
  calibration: Calibration | null;
  camera: boolean;
  /** Seated, or throwing with one arm: what the camera expects to see */
  body: BodyOptions;
  onBody: (b: BodyOptions) => void;
  best: Best | undefined;
  /** Your XP (null until it's loaded) */
  xp: number | null;
  onMode: (m: ModeId) => void;
  onCourtTheme: (t: CourtThemeId) => void;
  onTimedSeconds: (s: number) => void;
  onDifficulty: (d: DifficultyId) => void;
  onCalibrate: () => void;
  onStart: () => void;
}) {
  const isDaily = p.mode === "daily";
  const d = DIFFICULTIES[isDaily ? p.daily.difficulty : p.difficulty];
  // Only rendered on the client (after hydration), so localStorage and browser probes are safe here.
  const [profile] = useState(loadProfile);
  const [has3d] = useState(webglAvailable);
  const [clipsOk] = useState(clipsSupported);
  const view = has3d ? p.renderer : "2d";

  const footer = (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {MODES[p.mode].name}
          {p.mode === "timed" ? ` · ${formatDuration(p.timedSeconds)}` : ""}
          {isDaily ? ` · ${formatDuration(p.daily.seconds)}` : ""}
        </p>
        <p className="flex items-center gap-1 truncate text-[11px] text-stone">
          <HugeiconsIcon icon={ChampionIcon} size={12} />
          {p.best ? (p.mode === "streak" ? `Best ${p.best.streak} in a row` : `Best ${p.best.points} pts`) : `${d.name} · ${d.distance} m`}
        </p>
      </div>
      <ArrowButton icon={PlayIcon} onClick={p.onStart}>
        Play
      </ArrowButton>
    </div>
  );

  return (
    <Drawer label="Start menu" footer={footer}>
      <div className="flex items-center gap-3">
        <Link href="/profile" aria-label={`Edit ${profile.name || "your player"}'s look`} className="group relative shrink-0">
          <AvatarCanvas avatar={profile.avatar} crop="bust" className="size-12 rounded-full bg-card" />
          <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-ink text-cream transition group-hover:bg-hoop">
            <HugeiconsIcon icon={PencilEdit02Icon} size={11} />
          </span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{profile.name || "Your player"}</p>
          {p.xp !== null ? <XpBar xp={p.xp} className="mt-0.5 text-ink" /> : <p className="text-[11px] text-stone">{p.firstTime ? "How to play" : "Ready when you are"}</p>}
        </div>
        <IconLink href="/how-to-play" icon={BookOpen01Icon} label="How to play: camera, light and stance" size={38} />
        <IconLink href="/" icon={Home01Icon} label="Home" size={38} />
      </div>

      <h1 className="display mt-6 text-[2.6rem] sm:text-5xl">Shoot your shot</h1>

      <ChallengeBanner challenge={p.challenge.vs} note={p.challenge.note} active={p.challenge.active} onUse={p.challenge.onUse} onDismiss={p.challenge.onDismiss} />

      {p.firstTime && (
        <ol className="mt-4 space-y-2">
          {HOW_TO.map(([icon, t, desc]) => (
            <li key={t} className="flex gap-3 rounded-2xl bg-card p-3 text-xs leading-relaxed text-ink/70">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-hoop text-cream">
                <HugeiconsIcon icon={icon} size={15} />
              </span>
              <span>
                <b className="font-medium text-ink">{t}.</b> {desc}
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-6 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Game mode">
        {MODE_ORDER.map((id) => {
          const m = MODES[id];
          const on = id === p.mode;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => p.onMode(id)}
              className={`relative flex min-h-24 flex-col justify-between rounded-2xl p-3 text-left transition ${on ? "bg-hoop text-cream" : "bg-card hover:bg-white"}`}
            >
              <span className={`grid size-9 place-items-center rounded-full ${on ? "bg-cream text-hoop" : "bg-paper"}`}>
                <HugeiconsIcon icon={MODE_ICON[id]} size={18} />
              </span>
              <span className="mt-3 block text-base leading-tight font-medium">
                {m.name}
                {id === "daily" && <span className={`ml-1.5 text-[10px] ${on ? "text-cream/75" : "text-stone"}`}>{dailyLabel(p.daily.key)}</span>}
              </span>
              {on && (
                <span className="absolute top-3 right-3 grid size-5 place-items-center rounded-full bg-cream text-hoop">
                  <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2.4} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-stone">{MODES[p.mode].blurb}</p>

      <div className="mt-6 space-y-6">
        {p.mode === "timed" && (
          <div>
            <Label icon={Timer02Icon}>Shot clock</Label>
            <ShotClockPicker seconds={p.timedSeconds} onChange={p.onTimedSeconds} label="Shot clock" />
          </div>
        )}

        {isDaily ? (
          <DailyCard rules={p.daily} />
        ) : (
          <div>
            <Label icon={DashboardSpeed01Icon}>Difficulty</Label>
            <Segmented
              label="Difficulty"
              value={p.difficulty}
              onChange={p.onDifficulty}
              options={DIFFICULTY_ORDER.map((id) => ({ id, label: DIFFICULTIES[id].name }))}
            />
            <p className="mt-2 text-xs text-stone">
              {d.blurb} · {d.distance} m{d.hoopMotion ? " · moving hoop" : ""}
              {d.windMax ? ` · wind ±${d.windMax}` : ""}
              {d.scoreMultiplier > 1 ? ` · ×${d.scoreMultiplier} points` : ""}
            </p>
          </div>
        )}

        <CourtPicker value={p.courtTheme} onChange={p.onCourtTheme} />

        <div>
          <Label icon={CubeIcon} aside={has3d ? undefined : "This browser has no 3D graphics"}>
            View
          </Label>
          {has3d && (
            <Segmented
              label="View"
              value={view}
              onChange={p.onRenderer}
              options={[
                { id: "3d", label: "3D court", icon: CubeIcon },
                { id: "2d", label: "Classic 2D", icon: Layout01Icon },
              ]}
            />
          )}
        </div>

        {/* Extras as icon switches */}
        <div className="grid grid-cols-4 gap-2">
          {(p.mode === "timed" || isDaily) && <ToggleTile icon={GhostIcon} label="Race your ghost" on={p.ghost} onChange={p.onGhost} />}
          {view === "3d" && <ToggleTile icon={VideoReplayIcon} label="Instant replays" on={p.replays} onChange={p.onReplays} />}
          {p.camera && <ToggleTile icon={Notification01Icon} label="Green rim sound" on={p.greenSound} onChange={p.onGreenSound} />}
          {clipsOk && <ToggleTile icon={Film01Icon} label={`Record clips (C)`} on={p.clips.record} onChange={(record) => p.onClips({ ...p.clips, record })} />}
          {clipsOk && p.clips.record && (
            <ToggleTile icon={Camera01Icon} offIcon={CameraOff01Icon} label="Me in clips" on={p.clips.camera} onChange={(camera) => p.onClips({ ...p.clips, camera })} />
          )}
        </div>

        <div className="flex items-center gap-3 rounded-2xl bg-card p-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-full ${!p.camera ? "bg-paper" : p.calibration ? "bg-good/15 text-good" : "bg-warn/20 text-ink"}`}>
            <HugeiconsIcon icon={!p.camera ? KeyboardIcon : p.calibration ? Tick02Icon : Alert02Icon} size={18} />
          </span>
          <p className="min-w-0 flex-1 text-xs leading-snug text-ink/70">
            {p.camera ? (
              p.calibration ? (
                <>
                  <b className="font-medium text-ink">Calibrated</b>: your throw {p.calibration.avg.toFixed(1)} t/s ±{Math.round(consistency(p.calibration) * 100)}%
                </>
              ) : (
                <>
                  <b className="font-medium text-ink">Not calibrated.</b> 3 practice throws make your normal shot score.
                </>
              )
            ) : (
              <>
                <b className="font-medium text-ink">Keyboard mode</b>: hold Space to shoot.
              </>
            )}
          </p>
          {p.camera && <IconButton icon={Target02Icon} label={p.calibration ? "Recalibrate" : "Calibrate now"} tone={p.calibration ? "outline" : "dark"} onClick={p.onCalibrate} />}
        </div>

        {p.camera && (
          <div className="grid grid-cols-2 gap-2">
            <ToggleTile icon={ArmchairIcon} label="Seated (hips can be hidden)" on={!!p.body.seated} onChange={(seated) => p.onBody({ ...p.body, seated })} />
            <ToggleTile icon={WavingHand01Icon} label="One arm (track just the one)" on={!!p.body.oneArm} onChange={(oneArm) => p.onBody({ ...p.body, oneArm })} />
          </div>
        )}

        <p className="text-center text-[11px] text-stone">Video never leaves your device</p>
      </div>
    </Drawer>
  );
}

/** Today's rules, and when the next challenge arrives. */
function DailyCard({ rules }: { rules: DailyRules }) {
  const d = DIFFICULTIES[rules.difficulty];
  const [left, setLeft] = useState(() => msUntilNextDaily());
  useEffect(() => {
    const id = window.setInterval(() => setLeft(msUntilNextDaily()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return (
    <div className="rounded-2xl bg-court p-4 text-cream">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="display text-2xl">
            {d.name} · {formatDuration(rules.seconds)}
          </span>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-cream/70">
            <HugeiconsIcon icon={Timer02Icon} size={12} />
            New challenge in {h}h {m}m
          </p>
        </div>
        <IconLink href={`/leaderboard?mode=${rules.key}`} icon={ChampionIcon} label="Today's board" tone="light" size={38} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-cream/80">
        {d.distance} m{d.hoopMotion ? " · moving hoop" : ""}
        {d.windMax ? " · the same wind as everyone, shot for shot" : ""}
        {d.scoreMultiplier > 1 ? ` · ×${d.scoreMultiplier} points` : ""}. Play as often as you like: your best run counts.
      </p>
    </div>
  );
}

/* ───────── Move-into-frame guide ───────── */

type CheckState = "ok" | "bad" | "wait";

const AUTO_CONTINUE_MS = 1200;

export function SetupCheck(p: {
  cameraLive: boolean;
  tracking: boolean;
  framing: FramingIssue | null;
  confidence: number;
  lighting: LightingStatus;
  /** Seated or one-armed play (switchable here: a seated player stuck on "step back" needs to find it) */
  body: BodyOptions;
  onBody: (b: BodyOptions) => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const f = p.framing;
  const { seated, oneArm } = p.body;
  const seen = p.tracking && f !== "no_person";
  const checks: { label: string; state: CheckState; fix: string }[] = [
    { label: "Camera on", state: p.cameraLive ? "ok" : "wait", fix: "Allow camera access" },
    { label: "Tracking loaded", state: p.tracking ? "ok" : "wait", fix: "Downloading the pose model…" },
    { label: "You're in view", state: !p.tracking ? "wait" : seen ? "ok" : "bad", fix: "Step in front of the camera" },
    {
      label: "Good distance",
      state: !seen ? "wait" : f === "too_close" || f === "too_far" ? "bad" : "ok",
      fix: f === "too_far" ? "Come a bit closer" : seated ? "Sit back until your shoulders are well inside the frame" : "Step back until your hips are in view",
    },
    { label: "Centred", state: !seen ? "wait" : f === "off_center" ? "bad" : "ok", fix: "Move toward the middle" },
    {
      label: "Upper body visible",
      state: !seen ? "wait" : f === "low_visibility" || p.confidence < 0.6 ? "bad" : "ok",
      fix: `Show your shoulders, ${oneArm ? "your throwing arm" : "arms"}${seated ? "" : " and hips"}; avoid loose sleeves`,
    },
    {
      label: "Lighting",
      state: p.lighting === "unknown" ? "wait" : p.lighting === "ok" ? "ok" : "bad",
      fix: p.lighting === "dark" ? "Turn on a light in front of you" : "Bright window behind you: face it or close the blinds",
    },
  ];
  const allOk = checks.every((c) => c.state === "ok");
  const firstBad = checks.find((c) => c.state !== "ok");

  // Everything green and steady for a moment → carry on by itself (the player is standing back, away from the mouse).
  const continueRef = useRef(p.onContinue);
  useEffect(() => {
    continueRef.current = p.onContinue;
  });
  useEffect(() => {
    if (!allOk) return;
    const id = window.setTimeout(() => continueRef.current(), AUTO_CONTINUE_MS);
    return () => window.clearTimeout(id);
  }, [allOk]);

  return (
    <Modal label="Camera setup">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Tag>
            <HugeiconsIcon icon={Camera01Icon} size={12} /> Get in position
          </Tag>
          <h2 className="display mt-3 text-3xl">Move into frame</h2>
        </div>
        <IconButton icon={Cancel01Icon} label="Skip check" onClick={p.onSkip} />
      </div>
      <ul className="mt-5 grid grid-cols-2 gap-2">
        {checks.map((c) => (
          <li key={c.label} className={`flex items-center gap-2 rounded-2xl p-2.5 text-xs ${c.state === "ok" ? "bg-card text-ink" : "bg-card/60 text-ink/60"}`}>
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full ${c.state === "ok" ? "bg-good text-cream" : c.state === "bad" ? "bg-bad text-cream" : "bg-paper text-ink/40"}`}
              aria-hidden
            >
              <HugeiconsIcon icon={c.state === "ok" ? Tick02Icon : c.state === "bad" ? Alert02Icon : Loading03Icon} size={12} strokeWidth={2.2} className={c.state === "wait" ? "animate-spin" : ""} />
            </span>
            {c.label}
          </li>
        ))}
      </ul>
      <div className={`relative mt-4 overflow-hidden rounded-2xl px-4 py-3 text-sm ${allOk ? "bg-court text-cream" : "bg-ink text-cream"}`} aria-live="polite">
        {allOk ? "Looking good! Hold still, starting…" : firstBad?.fix}
        {allOk && (
          <span key="progress" className="absolute inset-x-0 bottom-0 h-1 origin-left bg-cream/70" style={{ animation: `setup-fill ${AUTO_CONTINUE_MS}ms linear forwards` }} />
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <ToggleTile icon={ArmchairIcon} label="I'm seated" on={!!seated} onChange={(on) => p.onBody({ ...p.body, seated: on })} />
        <ToggleTile icon={WavingHand01Icon} label="I throw with one arm" on={!!oneArm} onChange={(on) => p.onBody({ ...p.body, oneArm: on })} />
      </div>
    </Modal>
  );
}

/* ───────── Calibration ───────── */

export function CalibrationPanel(p: {
  samples: number[];
  outlier: boolean;
  loaded: boolean;
  result: Calibration | null;
  onRedo: () => void;
  onSave: () => void;
  onSkip: () => void;
}) {
  const done = p.samples.length >= CALIBRATION_THROWS;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 z-30 flex justify-center px-3 sm:top-28">
      <div className="pointer-events-auto w-full max-w-md rounded-[1.75rem] bg-paper p-5 text-ink shadow-2xl" role="dialog" aria-label="Calibration">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Tag>
              <HugeiconsIcon icon={Target02Icon} size={12} /> Calibration
            </Tag>
            <h2 className="display mt-2 text-2xl">{done ? "Got your shot" : `Practice throw ${p.samples.length + 1} of ${CALIBRATION_THROWS}`}</h2>
          </div>
          <div className="flex gap-2">
            {p.samples.length > 0 && <IconButton icon={Delete02Icon} label="Redo last throw" onClick={p.onRedo} size={36} />}
            {!done && <IconButton icon={Cancel01Icon} label="Skip calibration" onClick={p.onSkip} size={36} />}
          </div>
        </div>
        <p className="mt-1 text-sm text-ink/65">
          {done
            ? "Your normal throw will now land in the hoop at any distance."
            : p.loaded
              ? "Loaded! Push up and out with your normal, comfortable shot."
              : "Raise the ball above your head and pause until it glows."}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {Array.from({ length: CALIBRATION_THROWS }, (_, i) => {
            const v = p.samples[i];
            return (
              <div
                key={i}
                className={`rounded-2xl px-2 py-3 text-center transition ${v !== undefined ? "bg-ink text-cream" : i === p.samples.length ? "animate-pulse bg-hoop/15 ring-2 ring-hoop" : "bg-card"}`}
              >
                <div className="font-mono text-xl tabular-nums">{v !== undefined ? v.toFixed(1) : "–"}</div>
                <div className="text-[10px] opacity-55">torso/s</div>
              </div>
            );
          })}
        </div>
        {p.outlier && !done && <p className="mt-3 rounded-xl bg-warn/20 px-3 py-2 text-xs">That one was very different from the others. Redo it?</p>}
        {done && p.result && (
          <p className="mt-3 text-xs text-ink/65">
            Average <b className="text-ink">{p.result.avg.toFixed(2)}</b> · consistency ±{Math.round(consistency(p.result) * 100)}%
            {consistency(p.result) > 0.25 ? " (pretty varied: Rookie or Starter will feel fairest)" : ""}
          </p>
        )}
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs text-stone">{done ? "" : "Throws here don't count."}</span>
          {done && (
            <ArrowButton icon={Tick02Icon} onClick={p.onSave}>
              Save
            </ArrowButton>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────── Pause ───────── */

export function PauseMenu(p: {
  sound: boolean;
  camera: boolean;
  onResume: () => void;
  onRestart: () => void;
  onRecalibrate: () => void;
  onMenu: () => void;
  onSound: () => void;
  onCamera: () => void;
}) {
  return (
    <Modal label="Paused">
      <Tag>Paused</Tag>
      <h2 className="display mt-3 text-5xl">Timeout</h2>
      <div className="mt-6 grid grid-cols-4 gap-y-5">
        <RoundAction icon={PlayIcon} label="Resume" tone="dark" onClick={p.onResume} />
        <RoundAction icon={RepeatIcon} label="Restart" onClick={p.onRestart} />
        <RoundAction icon={Settings02Icon} label="Mode" onClick={p.onMenu} />
        {p.camera ? <RoundAction icon={Target02Icon} label="Calibrate" onClick={p.onRecalibrate} /> : <span />}
        <RoundAction icon={p.sound ? VolumeHighIcon : VolumeOffIcon} label={p.sound ? "Sound on" : "Sound off"} onClick={p.onSound} />
        <RoundAction icon={p.camera ? Camera01Icon : CameraOff01Icon} label={p.camera ? "Camera on" : "Camera off"} onClick={p.onCamera} />
        <RoundAction icon={Home01Icon} label="Quit" href="/" />
      </div>
      <p className="mt-6 text-center text-[11px] text-stone">Esc or P to resume</p>
    </Modal>
  );
}

/* ───────── Game over ───────── */

export function GameOver(p: {
  mode: ModeId;
  difficulty: DifficultyId;
  /** Clock length of a timed or daily run */
  seconds: number | undefined;
  daily: DailyRules;
  tally: Tally;
  newBest: boolean;
  best: Best | undefined;
  /** Leaderboard entry for this run (null for free play) */
  run: (RunSubmission & { id: number }) | null;
  courtTheme: CourtThemeId;
  /** XP before and after this run */
  xp: { before: number; after: number } | null;
  /** What the run's shots say to work on */
  coach: CoachReport | null;
  /** The friend's challenge this run raced */
  raced: Challenge | null;
  /** This run, as a challenge to send (timed and daily runs with shots) */
  challenge: Challenge | null;
  /** Save the last seconds of the run as a clip (absent when clips are off or unsupported) */
  onClip?: () => void;
  onAgain: () => void;
  onMenu: () => void;
}) {
  const t = p.tally;
  const accuracy = t.shots ? Math.round((t.makes / t.shots) * 100) : 0;
  const headline = p.mode === "streak" ? `${t.best} in a row` : `${t.points} points`;
  // Only rendered on the client (after hydration), so localStorage is safe here.
  const [profile] = useState(loadProfile);
  const site = siteUrl();
  const what = `${MODES[p.mode].name}${p.mode === "daily" ? ` ${dailyLabel(p.daily.key)}` : ""}${p.seconds ? ` · ${formatDuration(p.seconds)}` : ""} · ${DIFFICULTIES[p.difficulty].name}`;
  const card: ResultCardData = {
    context: what,
    headline: p.newBest ? "New best!" : "Beat that.",
    badge: p.newBest ? "Personal best" : undefined,
    players: [
      {
        name: profile.name || "Me",
        avatar: profile.avatar,
        score: String(p.mode === "streak" ? t.best : t.points),
        you: true,
        winner: true,
      },
    ],
    unit: p.mode === "streak" ? "in a row" : "points",
    stats: [
      ["Makes", `${t.makes}/${t.shots}`],
      ["Accuracy", `${accuracy}%`],
      ["Swishes", String(t.swishes)],
      ["Best streak", String(t.best)],
    ],
    theme: p.courtTheme,
    url: site,
  };

  const footer = (
    <div className="flex items-center gap-2">
      <IconButton icon={Settings02Icon} label="Change mode" onClick={p.onMenu} size={44} />
      {p.onClip && <IconButton icon={Film01Icon} label={`Save a clip of the last ${CLIP_SECONDS} seconds`} onClick={p.onClip} size={44} />}
      <ArrowButton icon={RepeatIcon} onClick={p.onAgain} className="ml-auto">
        Play again
      </ArrowButton>
    </div>
  );

  return (
    <Drawer label="Game over" footer={footer}>
      <Tag>{what}</Tag>
      <h2 className="display mt-4 text-4xl">{p.seconds ? "Buzzer!" : p.mode === "streak" ? "Streak over" : "Nice session"}</h2>

      <div className="relative mt-4 overflow-hidden rounded-[1.5rem] bg-hoop p-5 text-cream">
        <svg viewBox="0 0 400 200" className="absolute -right-10 -bottom-10 w-72 text-white/10" aria-hidden>
          <path d="M10 180C60 40 180 0 260 40s40 120-60 130" fill="none" stroke="currentColor" strokeWidth="30" strokeLinecap="round" />
        </svg>
        <div className="relative flex items-start justify-between gap-3">
          <span className="display text-5xl sm:text-6xl">{headline}</span>
          {p.newBest && <Tag tone="dark" className="animate-count-pop">New best</Tag>}
        </div>
        <p className="relative mt-2 text-xs text-cream/75">
          {p.newBest && p.seconds
            ? "Saved as your ghost: race it next time."
            : p.best && !p.newBest
              ? `Your best: ${p.mode === "streak" ? `${p.best.streak} in a row` : `${p.best.points} pts`}`
              : " "}
        </p>
      </div>

      <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
        {[
          ["Makes", `${t.makes}/${t.shots}`],
          ["Accuracy", `${accuracy}%`],
          ["Swishes", t.swishes],
          ["Streak", t.best],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-card py-3">
            <dd className="font-mono text-lg tabular-nums">{v}</dd>
            <dt className="text-[10px] text-stone">{k}</dt>
          </div>
        ))}
      </dl>

      <ChallengeResult raced={p.raced} mine={p.challenge} points={t.points} className="mt-3" />
      {p.coach && p.coach.shots > 0 && <ShotCoach report={p.coach} className="mt-3" />}
      {p.xp && <XpSummary before={p.xp.before} after={p.xp.after} className="mt-3 !bg-card" />}
      {p.run && <LeaderboardPost run={p.run} />}
      {t.shots > 0 && (
        <div className="mt-3">
          <ShareCardButton card={card} filename="airhoops-score.png" text={`${headline} on AirHoops 🏀 Beat that, using only your arms. ${site}/play`} />
        </div>
      )}
    </Drawer>
  );
}
