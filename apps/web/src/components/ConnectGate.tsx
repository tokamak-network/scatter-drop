"use client";

import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { WalletConnect } from "./WalletConnect";

/**
 * Renders `children` when a wallet is connected; otherwise shows a card with a
 * prompt and the connect button. Used wherever a page needs an address.
 */
export function ConnectGate({
  prompt = "Connect a wallet to continue.",
  children,
}: {
  prompt?: ReactNode;
  children: ReactNode;
}) {
  const { isConnected } = useAccount();

  if (isConnected) {
    return <>{children}</>;
  }

  return (
    <div className="card" style={{ textAlign: "center" }}>
      <p className="muted">{prompt}</p>
      <WalletConnect />
    </div>
  );
}
