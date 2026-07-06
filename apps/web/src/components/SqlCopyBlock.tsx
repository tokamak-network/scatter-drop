"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { whiteBtnClass } from "@/components/pop";

/**
 * A read-only SQL snippet with a copy button — shared by the Dune query guides
 * in DuneImport and StakingImport (the "how to run on Dune" boxes), so the
 * pre/copy chrome and the brief "copied" flash stay identical.
 */
export function SqlCopyBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl border border-ink/15 bg-white p-3 text-[10.5px] leading-relaxed font-mono text-ink/80">
        {sql}
      </pre>
      <button
        type="button"
        onClick={copy}
        className={`absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] ${whiteBtnClass("sm")}`}
      >
        {copied ? <Check className="w-3 h-3 text-ink" /> : <Copy className="w-3 h-3" />}
        {copied ? "Copied" : "Copy SQL"}
      </button>
    </div>
  );
}
