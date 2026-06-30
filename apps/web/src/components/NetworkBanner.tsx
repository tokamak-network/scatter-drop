"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { SUPPORTED_CHAINS, SUPPORTED_CHAIN_IDS } from "@/lib/wagmi";
import { useMounted } from "@/lib/useMounted";

export function NetworkBanner() {
  const { isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const mounted = useMounted();

  // Render nothing until mounted (avoids hydration mismatch), when
  // disconnected, while the chain is still hydrating (chainId undefined), or
  // when the active chain is supported.
  if (!mounted || !isConnected || chainId === undefined || SUPPORTED_CHAIN_IDS.includes(chainId)) {
    return null;
  }

  return (
    <div
      style={{
        background: "var(--color-warning)",
        color: "#1a1205",
        textAlign: "center",
        padding: "8px 16px",
        fontSize: 14,
      }}
    >
      Unsupported network. Switch to{" "}
      {SUPPORTED_CHAINS.map((chain) => (
        <button
          key={chain.id}
          className="btn"
          style={{ padding: "2px 8px", margin: "0 4px" }}
          onClick={() => switchChain({ chainId: chain.id })}
        >
          {chain.name}
        </button>
      ))}
      to continue.
    </div>
  );
}
