import type { ReactNode } from "react";
import { POP_CHIP } from "@/components/pop";

/**
 * Pop design-system micro-components — the JSX siblings of the class recipes
 * in pop.ts (kept separate so that module stays a plain string library).
 */

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
