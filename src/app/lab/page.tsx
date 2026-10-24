import type { Metadata } from "next";
import { SiteNav } from "@/components/home/SiteNav";
import { LabClient } from "@/components/lab/LabClient";

export const metadata: Metadata = {
  title: "Lab",
  description: "Tracking debug view: live webcam with pose skeleton overlay.",
};

export default function LabPage() {
  return (
    <div className="min-h-full flex-1">
      <SiteNav tone="dark" />
      <main className="mx-auto max-w-7xl px-5 pb-12 sm:px-8">
        <div className="mt-4 mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-medium">
              <span className="size-1.5 rounded-full bg-ink" /> Developer lab
            </p>
            <h1 className="display mt-3 text-6xl text-hoop sm:text-7xl">Tracking lab/</h1>
          </div>
          <p className="max-w-sm text-sm text-stone">
            Stand back so your upper body and hips are in frame. Your arms light up when tracking locks on.
          </p>
        </div>
        <LabClient />
      </main>
    </div>
  );
}
