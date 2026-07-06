"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { inkBtnClass, whiteBtnClass } from "@/components/pop";
import { useMounted } from "@/lib/useMounted";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const connectCls = `text-sm disabled:opacity-50 disabled:pointer-events-none ${inkBtnClass("md")}`;

export function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const mounted = useMounted();

  // Until mounted, render the connected-agnostic default so server markup
  // matches the first client paint (avoids hydration mismatch).
  if (!mounted) {
    return (
      <button className={connectCls} disabled>
        Connect Wallet
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <button
        className={`text-sm font-mono ${whiteBtnClass("md")}`}
        onClick={() => disconnect()}
      >
        {short(address)}
      </button>
    );
  }

  const injectedConnector = connectors[0];

  return (
    <button
      className={connectCls}
      disabled={!injectedConnector || isPending}
      onClick={() => injectedConnector && connect({ connector: injectedConnector })}
    >
      {isPending ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
