import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen flex-1 place-items-center bg-paper px-5 text-ink">
      <div className="max-w-md text-center">
        <p className="text-xs font-semibold text-hoop">404</p>
        <h1 className="display mt-3 text-6xl">Off the rim</h1>
        <p className="mt-3 text-sm text-ink/65">That page doesn&apos;t exist.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/play" className="rounded-full bg-ink text-cream px-6 py-2.5 text-sm font-semibold hover:bg-hoop">
            Play
          </Link>
          <Link href="/" className="rounded-full border border-ink/20 px-6 py-2.5 text-sm font-semibold hover:border-ink/50">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
