import Link from "next/link";

export function BallIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <radialGradient id="ball-g" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ff8a4c" />
          <stop offset="60%" stopColor="#ea3a1d" />
          <stop offset="100%" stopColor="#a3200e" />
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
    <Link href="/" className={`flex items-center gap-2 font-display text-xl tracking-wide uppercase italic ${className}`}>
      <BallIcon className="size-5" />
      <span>Air<span className="text-hoop">hoops</span></span>
    </Link>
  );
}
