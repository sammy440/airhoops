import Link from "next/link";

export function BallIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <radialGradient id="ball-g" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#e9906a" />
          <stop offset="60%" stopColor="#c8623a" />
          <stop offset="100%" stopColor="#8f3d1f" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#ball-g)" />
      <g fill="none" stroke="#1a0d05" strokeOpacity=".55" strokeWidth="1.4">
        <path d="M1 16h30M16 1v30" />
        <path d="M5.5 5.5c4.5 4 4.5 17 0 21M26.5 5.5c-4.5 4-4.5 17 0 21" />
      </g>
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 text-lg font-semibold tracking-[-0.03em] ${className}`}>
      <BallIcon className="size-5" />
      <span>AirHoops</span>
    </Link>
  );
}
