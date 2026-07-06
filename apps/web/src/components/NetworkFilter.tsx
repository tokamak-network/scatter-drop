"use client";

import { useState } from "react";
import { useChainId, useChains } from "wagmi";
import { Globe } from "lucide-react";
import { pillClass } from "@/components/pop";
import { useMounted } from "@/lib/useMounted";

/**
 * Chain shown by a board's NetworkFilter: follows the wallet's chain until
 * the user picks one. Keeps the fallback semantics in one place.
 */
export function usePickedChain(): [number, (chainId: number) => void] {
  const walletChainId = useChainId();
  const [picked, setPicked] = useState<number>();
  return [picked ?? walletChainId, setPicked];
}

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
  // The viewed chain follows the wallet, which reconnects after hydration —
  // mark the active pill only once mounted so server and first client render
  // agree (same guard the manage pages use for wallet-derived state).
  const mounted = useMounted();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-ink/50">
        <Globe className="w-3.5 h-3.5" /> Network
      </span>
      {chains.map((c) => {
        const active = mounted && c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(c.id)}
            className={pillClass(active, "bg-pop-purple")}
          >
            {c.name} · {c.id}
          </button>
        );
      })}
    </div>
  );
}
