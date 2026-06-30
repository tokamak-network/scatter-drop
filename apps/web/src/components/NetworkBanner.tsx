"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { SUPPORTED_CHAINS, SUPPORTED_CHAIN_IDS } from "@/lib/wagmi";

export function NetworkBanner() {
  const { isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  if (!isConnected || (chainId && SUPPORTED_CHAIN_IDS.includes(chainId))) {
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
