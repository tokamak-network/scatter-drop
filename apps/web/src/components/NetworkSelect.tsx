"use client";

import { useAccount, useChains, useSwitchChain } from "wagmi";
import { Globe } from "lucide-react";

/**
 * Registry-driven target-network picker (campaign wizard). Everything
 * downstream — deployment resolution, fee/allow-list reads, writes — already
 * follows the wallet's active chain (multi-network P2), so selecting a
 * network here simply switches the wallet chain and the wizard re-resolves.
 */
export function NetworkSelect() {
  const { chainId, isConnected } = useAccount();
  const chains = useChains();
  const { switchChain, isPending } = useSwitchChain();
  const unsupported = isConnected && !chains.some((c) => c.id === chainId);

  return (
    <div className="flex flex-wrap items-center gap-2 bg-slate-900/50 border border-slate-800/60 rounded-lg px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-400">
        <Globe className="w-3.5 h-3.5" /> Network
      </span>
      {chains.map((c) => {
        const active = c.id === chainId;
        return (
          <button
            key={c.id}
            type="button"
            disabled={active || isPending || !isConnected}
            onClick={() => switchChain({ chainId: c.id })}
            title={active ? "Current network" : `Switch wallet to ${c.name}`}
            className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold border transition ${
              active
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 cursor-default"
                : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-600 disabled:opacity-50"
            }`}
          >
            {c.name} · {c.id}
          </button>
        );
      })}
      {unsupported && (
        <span className="text-[11px] text-amber-500">
          Wallet is on an unsupported network — pick one above to switch.
        </span>
      )}
    </div>
  );
}
