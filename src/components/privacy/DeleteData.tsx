"use client";

import { useEffect, useState } from "react";
import { api, ApiError, loadGuest, saveGuest } from "@/lib/net/api";

type State = { kind: "none" } | { kind: "ready"; name: string } | { kind: "confirm"; name: string } | { kind: "busy" } | { kind: "done" } | { kind: "error"; message: string };

/** Erases the guest profile and everything linked to it on the server. */
export function DeleteData() {
  const [state, setState] = useState<State>({ kind: "none" });

  useEffect(() => {
    const g = loadGuest();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage
    if (g) setState({ kind: "ready", name: g.user.nickname });
  }, []);

  const erase = async () => {
    const g = loadGuest();
    if (!g) return setState({ kind: "none" });
    setState({ kind: "busy" });
    try {
      await api.deleteMe(g.token);
      saveGuest(null);
      setState({ kind: "done" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        saveGuest(null); // already gone on the server
        return setState({ kind: "done" });
      }
      setState({ kind: "error", message: e instanceof ApiError ? e.message : "Couldn't delete right now" });
    }
  };

  const box = "rounded-2xl border border-cream/10 bg-white/[0.03] px-4 py-3 text-sm";
  switch (state.kind) {
    case "none":
      return <p className={box}>This browser has no online profile, so there&apos;s nothing stored about you on our server.</p>;
    case "done":
      return <p className={`${box} text-good`}>Done. Your online profile, scores and throws are deleted.</p>;
    case "busy":
      return <p className={box}>Deleting…</p>;
    case "error":
      return (
        <p className={`${box} text-bad`}>
          {state.message}.{" "}
          <button type="button" onClick={erase} className="font-semibold underline">
            Try again
          </button>
        </p>
      );
    case "ready":
      return (
        <div className={`${box} flex flex-wrap items-center justify-between gap-3`}>
          <span>
            Online as <b className="text-cream">{state.name}</b>
          </span>
          <button type="button" onClick={() => setState({ kind: "confirm", name: state.name })} className="rounded-full border border-bad/60 px-4 py-2 font-semibold text-bad hover:bg-bad/10">
            Delete my online data
          </button>
        </div>
      );
    case "confirm":
      return (
        <div className={`${box} flex flex-wrap items-center justify-between gap-3 border-bad/40`} role="alertdialog" aria-label="Confirm delete">
          <span>Delete {state.name} and all their scores for good?</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setState({ kind: "ready", name: state.name })} className="rounded-full border border-cream/20 px-4 py-2 font-semibold">
              Cancel
            </button>
            <button type="button" onClick={erase} autoFocus className="rounded-full bg-bad px-4 py-2 font-semibold text-ink">
              Yes, delete
            </button>
          </span>
        </div>
      );
  }
}
