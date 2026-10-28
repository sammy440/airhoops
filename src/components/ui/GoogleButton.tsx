"use client";

import { useEffect, useRef, useState } from "react";
import { loadProfile, saveProfile, validName } from "@/lib/game/avatar";
import { api, ApiError, loadGuest, saveGuest, type GuestSession } from "@/lib/net/api";

/**
 * "Continue with Google" (Google Identity Services). Google hands us a signed
 * ID token; the API checks it and keeps only the account ID. Renders nothing
 * unless NEXT_PUBLIC_GOOGLE_CLIENT_ID is set.
 */

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

interface GoogleId {
  initialize(cfg: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: "popup" }): void;
  renderButton(el: HTMLElement, opts: Record<string, string | number>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let scriptLoad: Promise<void> | null = null;
function loadScript() {
  scriptLoad ??= new Promise<void>((resolve, reject) => {
    if (window.google?.accounts) return resolve();
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptLoad = null;
      reject(new Error("Google sign-in didn't load"));
    };
    document.head.appendChild(s);
  });
  return scriptLoad;
}

/**
 * Exchanges a Google credential for an AirHoops session on this device.
 * First time: this device's guest (or profile) becomes the Google player.
 * Existing account (e.g. a new phone): that player's name and look come to this device.
 */
async function signIn(credential: string): Promise<GuestSession> {
  const profile = loadProfile();
  const name = profile.name.trim();
  const r = await api.googleSignIn({
    credential,
    guest_token: loadGuest()?.token,
    nickname: validName(name) ? name : undefined,
    avatar: profile.avatar,
  });
  if (r.account === "existing") saveProfile({ name: r.user.nickname, avatar: r.user.avatar ?? profile.avatar });
  else if (!name) saveProfile({ ...profile, name: r.user.nickname });
  const session = { token: r.token, user: r.user };
  saveGuest(session);
  return session;
}

export function GoogleButton({ onSignedIn, className }: { onSignedIn: (s: GuestSession) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(onSignedIn);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    done.current = onSignedIn;
  }, [onSignedIn]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let live = true;
    loadScript()
      .then(() => {
        const el = ref.current;
        const id = window.google?.accounts.id;
        if (!live || !el || !id) return;
        id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          ux_mode: "popup",
          callback: ({ credential }) => {
            setBusy(true);
            setError(null);
            signIn(credential)
              .then((s) => done.current(s))
              .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Google sign-in failed. Try again."))
              .finally(() => setBusy(false));
          },
        });
        id.renderButton(el, { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", width: Math.min(400, el.clientWidth || 320) });
      })
      .catch(() => live && setError("Google sign-in is unavailable right now."));
    return () => {
      live = false;
    };
  }, []);

  if (!GOOGLE_CLIENT_ID) return null;
  return (
    <div className={className}>
      <div ref={ref} className={`flex min-h-10 w-full justify-center ${busy ? "pointer-events-none opacity-50" : ""}`} />
      {error && <p className="mt-2 text-center text-xs text-bad">{error}</p>}
    </div>
  );
}
