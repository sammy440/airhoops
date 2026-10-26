"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteNav } from "@/components/home/SiteNav";
import { AvatarCanvas } from "@/components/ui/AvatarCanvas";
import {
  DEFAULT_AVATAR,
  HAIR_COLORS,
  HAIR_STYLES,
  KIT_COLORS,
  loadProfile,
  randomAvatar,
  saveProfile,
  SKIN_TONES,
  validName,
  type Avatar,
  type Gender,
} from "@/lib/game/avatar";
import { loadGuest, pushProfile } from "@/lib/net/api";

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; synced: boolean };

const SHOE_COLORS = [{ name: "White", hex: "#f4f1ea" }, { name: "Black", hex: "#17110d" }, ...KIT_COLORS.slice(0, 8)];

export function ProfileClient() {
  const [name, setName] = useState("");
  const [look, setLook] = useState<Avatar>(DEFAULT_AVATAR);
  const [saved, setSaved] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);
  const [pose, setPose] = useState<"standing" | "shooting">("standing");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    const p = loadProfile();
    // A multiplayer guest already has a name; start from it.
    const n = p.name || loadGuest()?.user.nickname || "";
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from localStorage */
    setName(n);
    setLook(p.avatar);
    setSaved(JSON.stringify({ name: n, avatar: p.avatar }));
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const set = <K extends keyof Avatar>(key: K, value: Avatar[K]) => {
    setLook((l) => ({ ...l, [key]: value }));
    setStatus({ kind: "idle" });
  };

  const nameOk = validName(name);
  const dirty = hydrated && JSON.stringify({ name: name.trim(), avatar: look }) !== saved;

  const save = async () => {
    if (!nameOk) return;
    const n = name.trim();
    setStatus({ kind: "saving" });
    saveProfile({ name: n, avatar: look });
    setSaved(JSON.stringify({ name: n, avatar: look }));
    setName(n);
    const user = await pushProfile({ nickname: n, avatar: look });
    setStatus({ kind: "saved", synced: !!user });
  };

  return (
    <div className="min-h-screen flex-1 bg-ink text-cream">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_30%_0%,rgba(234,58,29,.16),transparent_70%)]" />
      <SiteNav tone="light" />
      <main className="relative mx-auto max-w-6xl px-5 pb-28 sm:px-8">
        <p className="mt-4 flex items-center gap-2 text-xs font-medium text-cream/70">
          <span className="size-1.5 rounded-full bg-hoop" /> Profile
        </p>
        <h1 className="display mt-3 text-6xl text-hoop sm:text-7xl">Your player/</h1>
        <p className="mt-2 max-w-xl text-sm text-cream/60">
          This is who takes the shots in Play and who your friends see in Multiplayer. Saved on this device; no account needed.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* Preview */}
          <section className="lg:sticky lg:top-6 lg:self-start">
            <div className="relative overflow-hidden rounded-3xl border border-cream/10 bg-[radial-gradient(80%_60%_at_50%_30%,rgba(246,161,58,.18),transparent_70%),linear-gradient(#1f1e1b,#0e0e0d)]">
              <div className="absolute inset-x-0 bottom-0 h-[14%] bg-[linear-gradient(#7a4a24,#5a3518)] opacity-80" />
              <AvatarCanvas avatar={look} pose={pose} label={`${name || "Your player"}'s avatar`} className="relative block aspect-[4/5] w-full" />
              <div className="absolute top-4 left-4 rounded-full bg-ink/70 px-3 py-1 text-sm font-semibold backdrop-blur">
                {name.trim() || "Your name"} <span className="font-mono text-cream/60">#{look.number}</span>
              </div>
              <div className="absolute top-4 right-4 flex rounded-full bg-ink/70 p-1 text-[11px] font-semibold backdrop-blur">
                {(["standing", "shooting"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={pose === p}
                    onClick={() => setPose(p)}
                    className={`rounded-full px-3 py-1 capitalize transition ${pose === p ? "bg-cream text-ink" : "text-cream/70 hover:text-cream"}`}
                  >
                    {p === "standing" ? "Ready" : "Shooting"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setLook(randomAvatar());
                  setStatus({ kind: "idle" });
                }}
                className="flex-1 rounded-full border border-cream/15 py-2.5 text-sm font-semibold transition hover:border-cream/40"
              >
                🎲 Randomize
              </button>
              <button
                type="button"
                onClick={() => {
                  setLook(DEFAULT_AVATAR);
                  setStatus({ kind: "idle" });
                }}
                className="flex-1 rounded-full border border-cream/15 py-2.5 text-sm font-semibold transition hover:border-cream/40"
              >
                Reset
              </button>
            </div>
          </section>

          {/* Editor */}
          <div className="grid gap-4">
            <Panel title="Name">
              <input
                aria-label="Name"
                maxLength={20}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setStatus({ kind: "idle" });
                }}
                placeholder="e.g. Dayo"
                className={`w-full rounded-xl border bg-ink px-4 py-3 text-lg outline-none ${name && !nameOk ? "border-bad" : "border-cream/15 focus:border-hoop"}`}
              />
              <p className={`mt-2 text-xs ${name && !nameOk ? "text-bad" : "text-cream/50"}`}>2–20 letters, numbers, spaces, . _ -</p>
            </Panel>

            <Panel title="Body">
              <div className="grid grid-cols-2 gap-2">
                {(["male", "female"] as Gender[]).map((g) => (
                  <Choice key={g} active={look.gender === g} onClick={() => set("gender", g)}>
                    {g === "male" ? "Male" : "Female"}
                  </Choice>
                ))}
              </div>
              <Label>Skin tone</Label>
              <Swatches options={SKIN_TONES} value={look.skin} onChange={(v) => set("skin", v)} custom />
            </Panel>

            <Panel title="Hair">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {HAIR_STYLES.map((h) => (
                  <Choice key={h.id} active={look.hair === h.id} onClick={() => set("hair", h.id)}>
                    {h.name}
                  </Choice>
                ))}
              </div>
              {look.hair !== "bald" && (
                <>
                  <Label>Hair colour</Label>
                  <Swatches options={HAIR_COLORS} value={look.hairColor} onChange={(v) => set("hairColor", v)} custom />
                </>
              )}
            </Panel>

            <Panel title="Jersey">
              <Swatches options={KIT_COLORS} value={look.jersey} onChange={(v) => set("jersey", v)} custom />
              <Label>Number</Label>
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Lower number" onClick={() => set("number", (look.number + 99) % 100)} className="size-10 rounded-xl border border-cream/15 text-lg hover:border-cream/40">
                  −
                </button>
                <input
                  aria-label="Jersey number"
                  inputMode="numeric"
                  value={look.number}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/\D/g, "").slice(-2) || 0);
                    set("number", n);
                  }}
                  className="h-10 w-16 rounded-xl border border-cream/15 bg-ink text-center font-mono text-lg outline-none focus:border-hoop"
                />
                <button type="button" aria-label="Raise number" onClick={() => set("number", (look.number + 1) % 100)} className="size-10 rounded-xl border border-cream/15 text-lg hover:border-cream/40">
                  +
                </button>
              </div>
            </Panel>

            <Panel title="Shorts">
              <Swatches options={KIT_COLORS} value={look.shorts} onChange={(v) => set("shorts", v)} custom />
            </Panel>

            <Panel title="Sneakers">
              <Swatches options={SHOE_COLORS} value={look.shoes} onChange={(v) => set("shoes", v)} custom />
            </Panel>
          </div>
        </div>
      </main>

      {/* Save bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-cream/10 bg-ink/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <p className="min-w-0 truncate text-sm text-cream/60" aria-live="polite">
            {status.kind === "saving"
              ? "Saving…"
              : status.kind === "saved" && !dirty
                ? status.synced
                  ? "Saved. Friends in Multiplayer will see your new look."
                  : "Saved on this device."
                : dirty
                  ? "Unsaved changes"
                  : "All changes saved"}
          </p>
          <div className="flex shrink-0 gap-2">
            <Link href="/play" className="hidden rounded-full border border-cream/15 px-5 py-2.5 text-sm font-semibold transition hover:border-cream/40 sm:inline-block">
              Play
            </Link>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || !nameOk || status.kind === "saving"}
              className="rounded-full bg-hoop px-6 py-2.5 text-sm font-semibold transition hover:bg-hoop-soft disabled:opacity-40"
            >
              Save player
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-cream/10 bg-white/[0.03] p-5 sm:p-6">
      <h2 className="display mb-4 text-2xl">{title}</h2>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 mb-2 text-xs font-semibold tracking-[0.14em] text-cream/55 uppercase">{children}</div>;
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${active ? "border-hoop bg-hoop/15 text-cream" : "border-cream/10 text-cream/75 hover:border-cream/30"}`}
    >
      {children}
    </button>
  );
}

function Swatches({
  options,
  value,
  onChange,
  custom,
}: {
  options: readonly { name: string; hex: string }[];
  value: string;
  onChange: (hex: string) => void;
  custom?: boolean;
}) {
  const isCustom = !options.some((o) => o.hex === value);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.hex}
          type="button"
          title={o.name}
          aria-label={o.name}
          aria-pressed={value === o.hex}
          onClick={() => onChange(o.hex)}
          className={`size-10 rounded-full border-2 transition ${value === o.hex ? "scale-110 border-cream" : "border-cream/10 hover:border-cream/40"}`}
          style={{ background: o.hex }}
        />
      ))}
      {custom && (
        <label
          title="Custom colour"
          className={`relative grid size-10 cursor-pointer place-items-center overflow-hidden rounded-full border-2 transition ${isCustom ? "scale-110 border-cream" : "border-cream/10 hover:border-cream/40"}`}
          style={{ background: isCustom ? value : "conic-gradient(#ea3a1d,#f2b705,#13804f,#3aa8e8,#6b2fb3,#e84d8a,#ea3a1d)" }}
        >
          <span className="sr-only">Custom colour</span>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value.toLowerCase())} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
      )}
    </div>
  );
}
