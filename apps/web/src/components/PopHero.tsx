import type { ReactNode } from "react";

/**
 * Playful-pilot hero: white rounded canvas with a chunky uppercase headline
 * and vivid blob/squiggle decorations (Explore + Upcoming redesign pilot).
 * Decorations are aria-hidden inline SVGs so the page stays self-contained.
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
      <Squiggle className="absolute -left-4 top-6 w-24 text-pop-yellow rotate-12" />
      <Blob className="absolute -left-10 bottom-[-3rem] w-40 text-pop-mint" />
      <Flower className="absolute right-6 top-8 w-16 text-pop-purple" />
      <Blob className="absolute -right-12 bottom-[-4rem] w-44 text-pop-sky" />

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

function Blob({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M45 -60C57 -49 64 -33 68 -16C71 2 71 20 63 34C55 48 40 57 23 63C7 69 -10 71 -26 66C-42 60 -56 47 -64 31C-72 15 -73 -4 -67 -21C-60 -37 -46 -51 -31 -61C-15 -71 3 -77 20 -74C36 -71 33 -70 45 -60Z"
        transform="translate(100 100)"
      />
    </svg>
  );
}

function Squiggle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 60" className={className} aria-hidden="true" fill="none">
      <path
        d="M6 44C20 10 34 10 44 30C54 50 70 50 82 22C90 6 104 8 114 20"
        stroke="currentColor"
        strokeWidth="14"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Flower({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <g fill="currentColor">
        <circle cx="50" cy="24" r="18" />
        <circle cx="76" cy="50" r="18" />
        <circle cx="50" cy="76" r="18" />
        <circle cx="24" cy="50" r="18" />
        <circle cx="50" cy="50" r="14" />
      </g>
    </svg>
  );
}
