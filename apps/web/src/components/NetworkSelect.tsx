"use client";

import type { ReactNode } from "react";
import { useAccount, useChains, useSwitchChain } from "wagmi";
import { Globe } from "lucide-react";

/**
 * Presentational network pill row — one button per registered chain with the
 * active one highlighted. Behavior is the caller's: NetworkSelect switches
 * the wallet chain; the announcements form sets form state. `children`
 * renders trailing status/warning content inside the row.
 */
export function NetworkPills({
  chains,
  activeId,
  onSelect,
  disabled = false,
  title,
  children,
}: {
  chains: readonly { id: number; name: string }[];
  activeId: number | undefined;
  onSelect: (id: number) => void;
  /** Extra disable beyond the active pill (e.g. switch in flight, no wallet). */
  disabled?: boolean;
  title?: (chain: { id: number; name: string }, active: boolean) => string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-slate-900/50 border border-slate-800/60 rounded-lg px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-400">
        <Globe className="w-3.5 h-3.5" /> Network
      </span>
      {chains.map((c) => {
        const active = c.id === activeId;
        return (
          <button
            key={c.id}
            type="button"
            disabled={active || disabled}
            onClick={() => onSelect(c.id)}
            title={title?.(c, active)}
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
      {children}
    </div>
  );
}

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
    <NetworkPills
      chains={chains}
      activeId={chainId}
      onSelect={(id) => switchChain({ chainId: id })}
      disabled={isPending || !isConnected}
      title={(c, active) => (active ? "Current network" : `Switch wallet to ${c.name}`)}
    >
      {unsupported && (
        <span className="text-[11px] text-amber-500">
          Wallet is on an unsupported network — pick one above to switch.
        </span>
      )}
    </NetworkPills>
  );
}
