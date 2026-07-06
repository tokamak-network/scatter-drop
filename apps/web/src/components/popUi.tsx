import type { ReactNode } from "react";
import { POP_CHIP, segBtnClass } from "@/components/pop";

/**
 * Pop design-system micro-components — the JSX siblings of the class recipes
 * in pop.ts (kept separate so that module stays a plain string library).
 *
 * CONTRACT: server-safe. No hooks, no "use client", no browser APIs — server
 * components (e.g. the landing page) import from here. Event-handler props
 * (onClick, …) are fine: they're supplied by whatever parent renders these,
 * so a client parent wires interactivity while the components stay pure
 * presentational JSX. Anything that itself needs state/effects/browser APIs
 * belongs in its own "use client" file instead.
 */

/**
 * One segment of a single-choice toggle — wrap a row of these in a `SEG_WRAP`
 * shell. `aria-pressed` marks the active choice.
 */
export function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={segBtnClass(active)}>
      {children}
    </button>
  );
}

/** Ink chip with the signature pulsing mint dot (ACTIVE / LIVE / AVAILABLE). */
export function LiveChip({ children }: { children: ReactNode }) {
  return (
    <span className={`${POP_CHIP} uppercase text-white bg-ink border-ink flex items-center gap-1`}>
      <span className="w-1.5 h-1.5 rounded-full bg-pop-mint animate-pulse" />
      {children}
    </span>
  );
}

/** Label-over-value stat box; `tone` composes (cream on white panels, white/70 on tones). */
export function StatBox({
  label,
  value,
  tone = "bg-pop-cream",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className={`rounded-2xl ${tone} border border-ink/15 px-3 py-2.5`}>
      <div className="text-[10px] font-mono uppercase tracking-wider text-ink/50">{label}</div>
      <div className="text-sm font-semibold text-ink mt-0.5 truncate">{value}</div>
    </div>
  );
}
