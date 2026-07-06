"use client";

import { useChains } from "wagmi";
import { Globe } from "lucide-react";
import { pillClass } from "@/components/pop";

/**
 * Registered-network filter pills for the boards (Explore / Upcoming) —
 * unlike NetworkSelect (which switches the wallet's chain, with the
 * connected/unsupported logic that entails) this only changes what the page
 * reads. `value` is the chain being viewed; pair with usePickedChain.
 */
export function NetworkFilter({
  value,
  onChange,
}: {
  value: number;
  onChange: (chainId: number) => void;
}) {
  const chains = useChains();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-ink/50">
        <Globe className="w-3.5 h-3.5" /> Network
      </span>
      {chains.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className={pillClass(c.id === value, "bg-pop-purple")}
        >
          {c.name} · {c.id}
        </button>
      ))}
    </div>
  );
}
