import Link from "next/link";
import type { ReactNode } from "react";
import { SiteNav } from "@/components/home/SiteNav";

const SECTIONS = [
  ["quick-start", "Quick start"],
  ["setup", "Camera placement"],
  ["lighting", "Room lighting"],
  ["posture", "Posture & the shot"],
  ["aim", "Power, aim & the green rim"],
  ["extras", "Hot hand & hands-free"],
  ["no-camera", "Without a camera"],
  ["troubleshooting", "If throws don't register"],
] as const;

export function HowToPlay() {
  return (
    <div className="min-h-screen flex-1 bg-paper text-ink">
      <SiteNav />
      <main id="main" className="relative mx-auto max-w-3xl px-5 pb-20 sm:px-8">
        <p className="mt-4 flex items-center gap-2 text-xs font-medium text-ink/70">
          <span className="size-1.5 rounded-full bg-ink text-cream" /> How to play
        </p>
        <h1 className="display mt-3 text-5xl sm:text-7xl">Shoot with your body</h1>
        <p className="mt-4 text-lg text-ink/80">
          Your webcam watches your arms and turns a real shooting motion into a shot. A good spot, decent light and a clear set-and-push make all
          the difference. Two minutes here saves a lot of air balls.
        </p>

        <nav aria-label="On this page" className="mt-8 flex flex-wrap gap-2">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-full border border-ink/15 px-3 py-1.5 text-xs text-ink/75 transition hover:border-hoop hover:text-ink">
              {label}
            </a>
          ))}
        </nav>

        <Section id="quick-start" title="Quick start">
          <Steps
            items={[
              ["Open Play and allow the camera", "Your browser asks first. The video never leaves your device."],
              ["Stand back until your hips are in view", "The setup check ticks off framing, centring and lighting for you."],
              ["Hold the ball high, pause, push", "Both hands over your head, a beat of stillness (the ball glows yellow), then push up and out."],
              ["Calibrate once", "Three practice throws teach the game your normal shot, so your natural push scores."],
            ]}
          />
        </Section>

        <Section id="setup" title="Camera placement">
          <PlacementDiagram />
          <Tips
            items={[
              ["Distance", "About 2–3 m (6–10 ft) from a laptop or phone camera. Head to hips must be in frame; your torso should fill roughly a quarter to half of the picture's height."],
              ["Height", "Camera at about chest height, pointing straight at you. A laptop on a table is fine; tilt the screen so your head isn't cut off when your arms go up."],
              ["Face the camera", "Stand square to the screen, in the middle of the picture. Leave room above your head: the shot finishes with your arms up high."],
              ["Keep it steady", "Prop a phone up in landscape so it can't slide. Moving the camera mid-game makes the tracking re-learn where you are."],
              ["One player in view", "Tracking follows one person. Ask friends to stand behind the camera, not beside you."],
            ]}
          />
        </Section>

        <Section id="lighting" title="Room lighting">
          <p>
            The pose model needs to see your arms clearly. Most tracking trouble is lighting: in a dim room your arms blur and your throws stop
            registering, even though the skeleton still appears.
          </p>
          <Tips
            items={[
              ["Light in front of you", "Face a window or a lamp. The light should fall on you, not on the camera."],
              ["No bright window behind you", "Backlight turns you into a silhouette. Turn around, or close the blinds. The setup check warns when it sees this."],
              ["Bright and even", "Turn on the main room light. Strong side light throws shadows that hide an arm."],
              ["Contrast helps", "Clothes that stand out from the wall behind you, and sleeves that don't flap, track best."],
            ]}
          />
          <p>
            The setup check measures how bright the picture is (on your device, nothing is sent) and tells you if it&apos;s too dark or backlit.
          </p>
        </Section>

        <Section id="posture" title="Posture & the shot">
          <Steps
            items={[
              ["Stand tall, feet shoulder-width", "Knees soft, facing the camera. Keep your hips in view the whole time."],
              ["Set: hands high, pause", "Hold an imaginary ball above your head with both hands, elbows bent. Hold still for a beat: the ball glows yellow when you're loaded."],
              ["Push up and out", "Straighten your shooting arm up and towards the screen in one quick motion, snapping the elbow. A real push, not a wave."],
              ["Follow through", "Finish with your arm up and wrist flicked. Then bring your hands down before the next shot."],
            ]}
          />
          <p>
            Either hand works: the game picks the arm that moves. A shot needs the set first, so waving, stretching or scratching your head won&apos;t
            fire one by accident.
          </p>
        </Section>

        <Section id="aim" title="Power, aim & the green rim">
          <Tips
            items={[
              ["Power", "Push harder for a longer shot, softer for a shorter one. After calibrating, your normal push is the make. A little jump adds distance."],
              ["Aim", "Lean your shoulders left or right over your hips (don't step) to send the ball that way. The dots on the floor and the \"Lean aim\" readout show where it's going."],
              ["The green rim", "With the camera on, a green light loops round the rim every 3 seconds. Throw while the rim glows green and it's a guaranteed swish, however you threw it. Rookie gives you 1.2 s of green, Legend 0.6 s."],
              ["Coaching", "After each shot the card under the court tells you if you were short, long or wide, and how to fix it."],
            ]}
          />
        </Section>

        <Section id="extras" title="Hot hand & hands-free">
          <Tips
            items={[
              ["Hot hand", "Dribble at waist height in a steady rhythm (4 bounces), then shoot: a make scores one multiplier tier higher."],
              ["Raise a hand", "On menus and the game-over screen, hold a hand up high for a second to press the main button. No walking back to the keyboard."],
              ["Look around (3D)", "Drag or swipe the court to swing the camera, pinch or scroll to zoom, Reset view to go back."],
            ]}
          />
        </Section>

        <Section id="no-camera" title="Without a camera">
          <p>
            Every mode also plays without a camera. Hold <Kbd>Space</Kbd> (or press and hold the court) to charge, release to shoot. A quick tap is a
            medium shot. <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> change the arc, <Kbd>←</Kbd>
            <Kbd>→</Kbd> aim, <Kbd>Esc</Kbd> pauses. The green rim is for camera play only.
          </p>
        </Section>

        <Section id="troubleshooting" title="If throws don't register">
          <Tips
            items={[
              ["Check the light first", "A dim room is the most common cause. Turn on a light in front of you."],
              ["Check your distance", "Step back until your hips are in view, and stay centred."],
              ["Set, then push", "Hold the ball high and pause until it glows yellow, then push fast. A slow push reads as a stretch."],
              ["Watch the camera box", "PEAK is your arm speed; it needs to pass the SHOT line. If it stays below, push harder or recalibrate from the start menu."],
              ["Slow tracking warning?", "Close other tabs or apps using the camera, or pick Classic 2D in the start menu."],
            ]}
          />
          <p>
            Still stuck? Play with the keyboard or touch, and check <Link href="/privacy">what the camera does</Link>.
          </p>
        </Section>

        <div className="mt-14 flex flex-wrap gap-3">
          <Link href="/play" className="rounded-full bg-ink text-cream px-6 py-3 text-sm font-semibold transition hover:bg-hoop">
            Start playing
          </Link>
          <Link href="/multiplayer" className="rounded-full border border-ink/20 px-6 py-3 text-sm font-semibold transition hover:border-ink/50">
            Play with friends
          </Link>
        </div>
      </main>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-14 scroll-mt-6">
      <h2 className="display text-3xl sm:text-4xl">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink/75 [&_a]:font-semibold [&_a]:text-hoop [&_a:hover]:underline">{children}</div>
    </section>
  );
}

function Steps({ items }: { items: [string, string][] }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2">
      {items.map(([title, body], i) => (
        <li key={title} className="flex gap-3 rounded-2xl border border-ink/10 bg-card p-4">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-cream text-sm font-bold">{i + 1}</span>
          <span>
            <b className="block text-ink">{title}</b>
            <span className="text-sm text-ink/65">{body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Tips({ items }: { items: [string, string][] }) {
  return (
    <dl className="divide-y divide-ink/10 overflow-hidden rounded-2xl border border-ink/10">
      {items.map(([k, v]) => (
        <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr]">
          <dt className="font-semibold text-ink">{k}</dt>
          <dd className="text-sm text-ink/65">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="mx-0.5 rounded border border-ink/25 bg-card px-1.5 py-0.5 font-mono text-xs text-ink">{children}</kbd>;
}

/**
 * Left: side view. The laptop's screen (and its front camera) faces the player, who faces it 2–3 m away.
 * Right: what that camera sees, the player front-on and centred, head to hips with room above the hands.
 */
function PlacementDiagram() {
  const ink = "currentColor";
  const hoop = "#ea3a1d";
  return (
    <figure className="grid gap-3 sm:grid-cols-[1.7fr_1fr]">
      <div className="rounded-3xl border border-ink/10 bg-card p-4">
        <svg viewBox="0 0 420 230" className="w-full" role="img" aria-label="Side view: an open laptop on a table at chest height with its screen and camera facing the player, who stands 2 to 3 metres away facing it, ball held up over the head">
          <line x1="10" y1="200" x2="410" y2="200" stroke={ink} strokeOpacity=".25" strokeWidth="2" />
          {/* table */}
          <rect x="30" y="134" width="96" height="6" rx="2" fill={ink} fillOpacity=".35" />
          <line x1="42" y1="140" x2="42" y2="200" stroke={ink} strokeOpacity=".35" strokeWidth="4" />
          <line x1="114" y1="140" x2="114" y2="200" stroke={ink} strokeOpacity=".35" strokeWidth="4" />
          {/* laptop: base, then the lid hinged at the back (left), tilted back, screen facing right towards the player */}
          <rect x="62" y="128" width="44" height="6" rx="1.5" fill={ink} fillOpacity=".6" />
          <line x1="63" y1="129" x2="56" y2="88" stroke={ink} strokeOpacity=".85" strokeWidth="5" strokeLinecap="round" />
          <line x1="60" y1="126" x2="54" y2="92" stroke="#8fd3ff" strokeOpacity=".7" strokeWidth="2" transform="translate(4 0)" />
          <circle cx="61" cy="90" r="3.2" fill={hoop} />
          {/* what the camera sees: from the screen side towards the player */}
          <path d="M61 90 L316 22 L316 136 Z" fill={hoop} fillOpacity=".08" stroke={hoop} strokeOpacity=".45" strokeDasharray="4 4" />
          {/* player in profile, facing left (towards the laptop), ball up in the set */}
          <g stroke={ink} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".9">
            <circle cx="326" cy="58" r="12" />
            <line x1="327" y1="71" x2="329" y2="130" />
            <path d="M329 130 L321 164 L322 198" />
            <path d="M329 130 L337 164 L334 198" />
            <path d="M322 198 L312 198" />
            <path d="M334 198 L324 198" />
            <path d="M327 84 L303 76 L298 46" />
          </g>
          {/* face: nose pointing at the camera */}
          <path d="M314 56 L310 60 L314 61" stroke={ink} strokeWidth="2" fill="none" opacity=".9" />
          <circle cx="296" cy="35" r="9" fill="#f07b2c" />
          {/* labels */}
          <line x1="64" y1="214" x2="318" y2="214" stroke={ink} strokeOpacity=".5" />
          <line x1="64" y1="209" x2="64" y2="219" stroke={ink} strokeOpacity=".5" />
          <line x1="318" y1="209" x2="318" y2="219" stroke={ink} strokeOpacity=".5" />
          <text x="191" y="228" textAnchor="middle" fontSize="12" fill={ink} fillOpacity=".8">
            2–3 m (6–10 ft)
          </text>
          <text x="14" y="70" fontSize="11" fill={ink} fillOpacity=".75">
            screen &amp; camera
          </text>
          <text x="14" y="83" fontSize="11" fill={ink} fillOpacity=".75">
            face you, chest high
          </text>
          <text x="352" y="96" fontSize="11" fill={hoop}>
            you face
          </text>
          <text x="352" y="109" fontSize="11" fill={hoop}>
            the screen
          </text>
        </svg>
      </div>
      <div className="rounded-3xl border border-ink/10 bg-card p-4">
        <svg viewBox="0 0 200 230" className="mx-auto w-full max-w-[220px] sm:max-w-none" role="img" aria-label="What the camera sees: you facing it, centred, from head to hips, with space above your raised hands">
          <text x="100" y="16" textAnchor="middle" fontSize="11" fill={ink} fillOpacity=".7">
            What the camera sees
          </text>
          <rect x="16" y="26" width="168" height="190" rx="10" fill={ink} fillOpacity=".04" stroke={hoop} strokeOpacity=".6" strokeDasharray="5 4" />
          {/* front-on: centred, head to below the hips, hands up with room above */}
          <g stroke={ink} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".9">
            <circle cx="100" cy="98" r="13" />
            <path d="M74 120 L126 120" />
            <path d="M100 112 L100 178" />
            <path d="M86 178 L114 178" />
            <path d="M86 178 L82 216" />
            <path d="M114 178 L118 216" />
            <path d="M74 120 L66 92 L88 70" />
            <path d="M126 120 L134 92 L112 70" />
          </g>
          <circle cx="100" cy="62" r="11" fill="#f07b2c" />
          <line x1="22" y1="44" x2="178" y2="44" stroke={ink} strokeOpacity=".3" strokeDasharray="2 3" />
          <text x="100" y="40" textAnchor="middle" fontSize="9" fill={ink} fillOpacity=".55">
            room above your hands
          </text>
          <text x="176" y="184" textAnchor="end" fontSize="9" fill={hoop}>
            hips in view
          </text>
        </svg>
      </div>
    </figure>
  );
}
