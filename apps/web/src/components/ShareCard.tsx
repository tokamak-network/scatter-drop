"use client";

import { useState } from "react";
import { Check, Link as LinkIcon, Send, Share2, Twitter } from "lucide-react";
import { POP_HEADING, POP_PANEL, whiteBtnClass } from "@/components/pop";

/**
 * Share / promote the current page — copy link + one-tap social intents.
 * The single share surface app-wide (the campaign page's former inline twin
 * was folded into this one during the pop rollout).
 */
export function ShareCard({
  heading,
  description,
  shareText,
}: {
  heading: string;
  description: string;
  /** Post body for the social intents; the page URL is appended by each intent. */
  shareText: string;
}) {
  const [copied, setCopied] = useState(false);

  function href() {
    return typeof window !== "undefined" ? window.location.href : "";
  }
  function open(url: string) {
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener");
  }

  const shareBtnCls = "flex items-center justify-center gap-2";

  return (
    <div className={`bg-white p-6 space-y-4 ${POP_PANEL}`}>
      <div>
        <h3 className={`${POP_HEADING} flex items-center gap-1.5`}>
          <Share2 className="w-4 h-4 text-ink" />
          {heading}
        </h3>
        <p className="text-[11px] text-ink/60 mt-1.5 leading-snug">{description}</p>
      </div>

      <button
        type="button"
        onClick={async () => {
          // Only report "copied" when the clipboard write actually succeeded
          // (it can reject in non-secure contexts or without permission).
          try {
            await navigator.clipboard.writeText(href());
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* leave the button in its default state */
          }
        }}
        className={`w-full text-sm ${shareBtnCls} ${whiteBtnClass("lg", "bg-pop-cream")}`}
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 text-ink" /> Link copied
          </>
        ) : (
          <>
            <LinkIcon className="w-4 h-4 text-ink/50" /> Copy link
          </>
        )}
      </button>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() =>
            open(
              `https://twitter.com/intent/tweet?text=${encodeURIComponent(
                shareText,
              )}&url=${encodeURIComponent(href())}`,
            )
          }
          className={`text-xs ${shareBtnCls} ${whiteBtnClass("md", "bg-pop-cream")}`}
        >
          <Twitter className="w-3.5 h-3.5" /> Post on X
        </button>
        <button
          type="button"
          onClick={() =>
            open(
              `https://t.me/share/url?url=${encodeURIComponent(
                href(),
              )}&text=${encodeURIComponent(shareText)}`,
            )
          }
          className={`text-xs ${shareBtnCls} ${whiteBtnClass("md", "bg-pop-cream")}`}
        >
          <Send className="w-3.5 h-3.5" /> Telegram
        </button>
      </div>
    </div>
  );
}
