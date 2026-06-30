"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

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
