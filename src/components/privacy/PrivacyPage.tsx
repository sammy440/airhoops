import Link from "next/link";
import type { ReactNode } from "react";
import { SiteNav } from "@/components/home/SiteNav";
import { DeleteData } from "./DeleteData";

const ON_DEVICE = [
  ["Settings", "Camera on/off, sound, your last mode and difficulty"],
  ["Calibration", "Your average throw speed, so a normal shot scores"],
  ["Personal bests", "Your best score per mode and difficulty"],
  ["Your player", "Name and look (body, skin tone, hair, kit)"],
  ["Guest pass", "A random token, only if you play multiplayer, post a score or sign in with Google"],
];

const ON_SERVER = [
  ["Guest profile", "Nickname, look, and a hash of your guest token (never the token itself)"],
  ["Google sign-in (optional)", "Only Google's account ID, so the same player works on your other devices. No email, name, contacts or photo"],
  ["Scores", "Each posted run: mode, difficulty, score, shots and makes"],
  ["Matches", "Room code, mode, start/end time, winner"],
  ["Throws (multiplayer)", "Power, angle, arc and the result for each shot, so the server can referee"],
];

export function PrivacyPage() {
  return (
    <div className="min-h-screen flex-1 bg-ink text-cream">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(61,220,151,.10),transparent_70%)]" />
      <SiteNav tone="light" />
      <main id="main" className="relative mx-auto max-w-3xl px-5 pb-20 sm:px-8">
        <p className="mt-4 flex items-center gap-2 text-xs font-medium text-cream/70">
          <span className="size-1.5 rounded-full bg-good" /> Privacy
        </p>
        <h1 className="display mt-3 text-6xl text-hoop sm:text-7xl">Your video stays home/</h1>
        <p className="mt-4 text-lg text-cream/80">
          AirHoops watches your throw with your camera, but <b className="text-cream">the video never leaves your device</b>. It is not uploaded, not
          recorded and not seen by anyone, including us.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            ["📷", "Camera", "Frames go straight from your camera to a pose model running inside this browser tab."],
            ["🦴", "Skeleton", "The model turns each frame into 33 body points. The frame is then discarded."],
            ["🏀", "Throw", "Only the throw (power, angle, arc: three numbers) is used to play, and sent online only in multiplayer."],
          ].map(([icon, title, body], i) => (
            <div key={title} className="rounded-3xl border border-cream/10 bg-white/[0.03] p-5">
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-2xl">
                  {icon}
                </span>
                <span className="font-mono text-xs text-cream/60">0{i + 1}</span>
              </div>
              <h2 className="display mt-3 text-2xl">{title}</h2>
              <p className="mt-1 text-sm text-cream/65">{body}</p>
            </div>
          ))}
        </div>

        <Section title="The camera">
          <p>
            Your browser asks before the camera turns on, and you can say no: every mode also plays with the keyboard (hold <Kbd>Space</Kbd> to charge,
            release to shoot) or by tapping the screen. You can switch the camera off at any time from the game&apos;s top bar or pause menu, and your
            browser shows when it is in use.
          </p>
          <p>
            Pose tracking uses Google&apos;s MediaPipe model, served from our own site. If that download fails, the model file is fetched from
            Google&apos;s public model storage instead. That request downloads a file; it sends nothing about you or your video.
          </p>
          <p>
            The <Link href="/lab">Tracking Lab</Link> can record a throw for tuning. A recording contains body points only (no video) and is saved to
            your computer as a file. It is never uploaded.
          </p>
        </Section>

        <Section title="What stays on this device">
          <Table rows={ON_DEVICE} />
          <p>These live in your browser&apos;s local storage. Clearing site data for AirHoops removes them.</p>
        </Section>

        <Section title="What we store online">
          <p>Nothing, unless you play multiplayer or post a score to the leaderboard. Then:</p>
          <Table rows={ON_SERVER} />
          <p>
            There are no accounts, emails, passwords, cookies, ads or third-party trackers. Your IP address is used briefly in memory to stop spam
            (rate limiting) and may appear in our server logs, which our host keeps for a limited time.
          </p>
          <p>
            If the site crashes, the browser sends us the error message and the page it happened on, so we can fix it. Never video, body points or
            personal details.
          </p>
        </Section>

        <Section title="Delete your data">
          <p>
            Your nickname, look and scores are public on the leaderboards. You can erase everything we store online about you (your guest profile,
            scores and throws) right here. It can&apos;t be undone.
          </p>
          <DeleteData />
        </Section>

        <p className="mt-12 text-xs text-cream/60">Last updated October 2026.</p>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="display text-3xl">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-cream/75 [&_a]:font-semibold [&_a]:text-hoop [&_a:hover]:underline">{children}</div>
    </section>
  );
}

function Table({ rows }: { rows: string[][] }) {
  return (
    <dl className="divide-y divide-cream/10 overflow-hidden rounded-2xl border border-cream/10">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr]">
          <dt className="font-semibold text-cream">{k}</dt>
          <dd className="text-sm text-cream/65">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-cream/25 bg-white/5 px-1.5 py-0.5 font-mono text-xs text-cream">{children}</kbd>;
}
