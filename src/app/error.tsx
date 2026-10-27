"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportError } from "@/lib/monitoring";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => reportError(error), [error]);
  return (
    <main className="grid min-h-screen flex-1 place-items-center bg-ink px-5 text-cream">
      <div className="max-w-md text-center">
        <p className="text-xs font-semibold tracking-[0.16em] text-hoop uppercase">Airball</p>
        <h1 className="display mt-3 text-5xl">Something went wrong</h1>
        <p className="mt-3 text-sm text-cream/65">We&apos;ve logged it. Try again, or head back to the court.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={retry} className="rounded-full bg-hoop px-6 py-2.5 text-sm font-semibold hover:bg-hoop-soft">
            Try again
          </button>
          <Link href="/" className="rounded-full border border-cream/20 px-6 py-2.5 text-sm font-semibold hover:border-cream/50">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
