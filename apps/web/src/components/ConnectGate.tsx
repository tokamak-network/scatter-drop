"use client";

import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { WalletConnect } from "./WalletConnect";
import { POP_PANEL } from "@/components/pop";
import { useMounted } from "@/lib/useMounted";

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
  const mounted = useMounted();

  // Render `children` only after mount when connected. Before mount the server
  // and first client paint both show the prompt, so the gated content (and any
  // wallet-derived state inside it) never triggers a hydration mismatch.
  if (mounted && isConnected) {
    return <>{children}</>;
  }

  return (
    <div className={`bg-white p-8 text-center space-y-4 ${POP_PANEL}`}>
      <p className="text-sm text-ink/60">{prompt}</p>
      <WalletConnect />
    </div>
  );
}
