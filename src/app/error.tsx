"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportError } from "@/lib/monitoring";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => reportError(error), [error]);
  return (
    <main className="grid min-h-screen flex-1 place-items-center bg-paper px-5 text-ink">
      <div className="max-w-md text-center">
        <p className="text-xs font-semibold text-hoop">Airball</p>
        <h1 className="display mt-3 text-5xl">Something went wrong</h1>
        <p className="mt-3 text-sm text-ink/65">We&apos;ve logged it. Try again, or head back to the court.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={retry} className="rounded-full bg-ink text-cream px-6 py-2.5 text-sm font-semibold hover:bg-hoop">
            Try again
          </button>
          <Link href="/" className="rounded-full border border-ink/20 px-6 py-2.5 text-sm font-semibold hover:border-ink/50">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
