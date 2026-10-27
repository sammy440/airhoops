import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen flex-1 place-items-center bg-ink px-5 text-cream">
      <div className="max-w-md text-center">
        <p className="text-xs font-semibold tracking-[0.16em] text-hoop uppercase">404</p>
        <h1 className="display mt-3 text-6xl">Off the rim</h1>
        <p className="mt-3 text-sm text-cream/65">That page doesn&apos;t exist.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/play" className="rounded-full bg-hoop px-6 py-2.5 text-sm font-semibold hover:bg-hoop-soft">
            Play
          </Link>
          <Link href="/" className="rounded-full border border-cream/20 px-6 py-2.5 text-sm font-semibold hover:border-cream/50">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
