import type { ReactNode } from "react";

/**
 * Playful hero: white rounded canvas with a chunky uppercase headline and
 * airdrop-motif decorations — parachute, falling drops, confetti — instead of
 * generic blobs, so the look stays ours. Decorations are aria-hidden inline
 * SVGs so the page stays self-contained.
 */
export function PopHero({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border-2 border-ink bg-white pop-shadow px-6 py-12 md:py-16 text-center">
      {/* pointer-events-none: decorations must never intercept clicks/drags */}
      <Parachute className="pointer-events-none select-none absolute left-6 top-6 w-16 text-pop-mint -rotate-6" />
      <Drop className="pointer-events-none select-none absolute left-24 bottom-4 w-6 text-pop-sky rotate-12" />
      <Drop className="pointer-events-none select-none absolute right-28 top-10 w-8 text-pop-yellow -rotate-12" />
      <Parachute className="pointer-events-none select-none absolute right-4 bottom-2 w-20 text-pop-purple rotate-6" />
      <Confetti className="pointer-events-none select-none absolute inset-x-0 top-0 w-full h-full text-ink/10" />

      <div className="relative space-y-4 max-w-2xl mx-auto">
        <h1 className="font-chunk uppercase text-4xl md:text-6xl leading-[0.95] tracking-tight text-ink">
          {title}
        </h1>
        <p className="text-sm md:text-base text-ink/70 font-medium">{subtitle}</p>
        {action && <div className="flex justify-center pt-1">{action}</div>}
      </div>
    </section>
  );
}

/** Parachute with a hanging token box — the "airdrop" itself. */
function Parachute({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 110" className={className} aria-hidden="true" fill="none">
      <path
        d="M8 42C8 22 27 8 50 8C73 8 92 22 92 42L50 46L8 42Z"
        fill="currentColor"
      />
      <path d="M8 42L40 78M50 46L50 78M92 42L60 78" stroke="currentColor" strokeWidth="3.5" />
      <rect x="36" y="78" width="28" height="24" rx="6" fill="currentColor" />
    </svg>
  );
}

/** Falling droplet — the "drop". */
function Drop({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 80" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M30 4C30 4 8 34 8 50C8 64 18 74 30 74C42 74 52 64 52 50C52 34 30 4 30 4Z"
      />
    </svg>
  );
}

/** Sparse confetti field — the "scatter". */
function Confetti({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 160" className={className} aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <g fill="currentColor">
        <circle cx="40" cy="26" r="3" />
        <rect x="120" y="14" width="6" height="6" rx="1" transform="rotate(18 123 17)" />
        <circle cx="205" cy="20" r="2.5" />
        <rect x="300" y="30" width="5" height="5" rx="1" transform="rotate(-15 302 32)" />
        <circle cx="360" cy="14" r="3" />
        <rect x="70" y="120" width="5" height="5" rx="1" transform="rotate(30 72 122)" />
        <circle cx="255" cy="132" r="2.5" />
        <rect x="335" y="118" width="6" height="6" rx="1" transform="rotate(-24 338 121)" />
      </g>
    </svg>
  );
}
