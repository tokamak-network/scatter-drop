"use client";

import { useChains } from "wagmi";
import { NetworkPills } from "@/components/NetworkSelect";
import { useMounted } from "@/lib/useMounted";

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
