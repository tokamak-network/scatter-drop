"use client";

import { useState } from "react";
import { useChainId, useChains } from "wagmi";
import { NetworkPills } from "@/components/NetworkSelect";
import { useMounted } from "@/lib/useMounted";

/**
 * Chain shown by a board's NetworkFilter: follows the wallet's chain until
 * the user picks one. Keeps the fallback semantics in one place (and out of
 * pop.ts, which must stay hook-free so server components can import it).
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
  // no active pill until mounted so server and first client render agree
  // (same guard the manage pages use for wallet-derived state).
  const mounted = useMounted();
  return (
    <NetworkPills
      chains={chains}
      activeId={mounted ? value : undefined}
      onSelect={onChange}
    />
  );
}
