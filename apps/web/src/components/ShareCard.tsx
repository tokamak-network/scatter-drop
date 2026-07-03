"use client";

import { useState } from "react";
import { Check, Link as LinkIcon, Send, Share2, Twitter } from "lucide-react";

/**
 * Share / promote the current page — copy link + one-tap social intents.
 * Standalone twin of the campaign page's inline ShareCard (that file is owned
 * by the campaign-detail stream); new surfaces should import this one.
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

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
          <Share2 className="w-4 h-4 text-emerald-600" />
          {heading}
        </h3>
        <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">{description}</p>
      </div>

      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(href());
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="w-full flex items-center justify-center gap-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-100 text-sm font-semibold px-4 py-2.5 rounded-lg transition"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 text-emerald-600" /> Link copied
          </>
        ) : (
          <>
            <LinkIcon className="w-4 h-4 text-slate-400" /> Copy link
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
          className="flex items-center justify-center gap-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-lg transition"
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
          className="flex items-center justify-center gap-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-lg transition"
        >
          <Send className="w-3.5 h-3.5" /> Telegram
        </button>
      </div>
    </div>
  );
}
