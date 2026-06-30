"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useMounted } from "@/lib/useMounted";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const mounted = useMounted();

  // Until mounted, render the connected-agnostic default so server markup
  // matches the first client paint (avoids hydration mismatch).
  if (!mounted) {
    return (
      <button className="btn btn-primary" disabled>
        Connect Wallet
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <button className="btn" onClick={() => disconnect()}>
        {short(address)}
      </button>
    );
  }

  const injectedConnector = connectors[0];

  return (
    <button
      className="btn btn-primary"
      disabled={!injectedConnector || isPending}
      onClick={() => injectedConnector && connect({ connector: injectedConnector })}
    >
      {isPending ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
