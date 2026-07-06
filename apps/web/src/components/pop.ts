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

const BTN_PAD = { sm: "px-3 py-1", md: "px-3 py-1.5", lg: "px-5 py-2.5" } as const;

/** Solid-ink primary CTA pill (button/link/span). Size only changes padding. */
export function inkBtnClass(size: keyof typeof BTN_PAD = "md"): string {
  return `${BTN_PAD[size]} font-bold text-white bg-ink hover:bg-ink/80 rounded-full transition`;
}


/** Secondary white pill CTA — the outline sibling of inkBtnClass. */
export function whiteBtnClass(size: "sm" | "md" | "lg" = "md"): string {
  const pad = size === "sm" ? "px-3 py-1" : size === "md" ? "px-3.5 py-1.5" : "px-4 py-2";
  return `${pad} font-bold text-ink bg-white border-2 border-ink/20 hover:border-ink rounded-full transition`;
}

/** Form text-field skin. Shape (radius/padding) composes via `extra`. */
export function popInputClass(extra = ""): string {
  return `w-full bg-pop-cream border-2 border-ink/15 focus:border-ink text-ink placeholder-ink/40 text-sm outline-none transition ${extra}`;
}

/** Form field label. */
export const POP_LABEL =
  "block text-[11px] font-mono font-bold uppercase tracking-wider text-ink/50 mb-1.5";

/** Panel section heading (h3 inside a POP_PANEL). */
export const POP_HEADING =
  "text-xs font-mono font-bold uppercase tracking-wider text-ink/60";

/** Tiny status/type chip core — skin (colors) composes on top, e.g. STATUS_STYLES. */
export const POP_CHIP = "text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border";

/** Static panel shell (filter bars, boxes). Tone (bg-*) composes on top. */
export const POP_PANEL = "rounded-2xl border-2 border-ink pop-shadow-sm";

/** Clickable card shell — the sticker look plus hover lift. Tone composes on top. */
export const POP_CARD = "border-2 border-ink rounded-3xl pop-shadow hover:-translate-y-0.5 transition-transform";
