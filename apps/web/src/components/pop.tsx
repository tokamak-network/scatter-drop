/**
 * Playful design-system primitives (the "pop" look): single home for the
 * class recipes every page composes, so the app-wide rollout doesn't
 * copy-paste (and drift) the signature pill/chip/card strings per page.
 * Color tokens live in globals.css (@theme --color-pop-*, --color-ink);
 * offset shadows are the .pop-shadow utilities there.
 */

/** Filter/tab pill. `activeBg` is a bg-pop-* token class; `extra` for layout (e.g. flex-1). */
export function pillClass(active: boolean, activeBg: string, extra = ""): string {
  return `${extra} px-3.5 py-1.5 text-xs font-semibold rounded-full border-2 transition ${
    active
      ? `${activeBg} text-ink border-ink`
      : "bg-white text-ink/60 border-ink/15 hover:border-ink/40"
  }`;
}

/** Solid-ink primary CTA pill (button/link/span). Size only changes padding. */
export function inkBtnClass(size: "sm" | "md" | "lg" = "md"): string {
  const pad = size === "sm" ? "px-3 py-1" : size === "md" ? "px-3 py-1.5" : "px-5 py-2.5";
  return `${pad} font-bold text-white bg-ink hover:bg-ink/80 rounded-full transition`;
}

/** Tiny status/type chip core — skin (colors) composes on top, e.g. STATUS_STYLES. */
export const POP_CHIP = "text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border";

/** Static panel shell (filter bars, boxes). Tone (bg-*) composes on top. */
export const POP_PANEL = "rounded-2xl border-2 border-ink pop-shadow-sm";

/** Clickable card shell — the sticker look plus hover lift. Tone composes on top. */
export const POP_CARD = "border-2 border-ink rounded-3xl pop-shadow hover:-translate-y-0.5 transition-transform";
