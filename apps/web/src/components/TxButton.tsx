"use client";

import { useEffect, useRef, useState } from "react";
import {
  useChainId,
  useChains,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import type { Address, Hex, TransactionReceipt } from "viem";
import { Check, Loader2, X } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { inkBtnClass, POP_STATUS_CHIP, whiteBtnClass } from "@/components/pop";
import { TxHashLink } from "@/components/TxHashLink";

type TxStatus = {
  tone: string;
  icon: React.ReactNode;
  text: string;
  /** Extra line beside the chip (the failure reason). */
  detail?: string;
};

/**
 * Sends a prepared SDK calldata request ({to,data}) as a real transaction and
 * surfaces wallet/confirmation status. Used for claim / createDrop / approve /
 * withdrawFees in M5.
 */
export function TxButton({
  request,
  label,
  disabled,
  primary,
  onConfirmed,
  disableWhenConfirmed,
}: {
  request?: { to: Address; data: Hex; value?: bigint } | null;
  label: string;
  disabled?: boolean;
  primary?: boolean;
  /** Fired once when the tx succeeds, with its receipt (for reading logs). */
  onConfirmed?: (receipt: TransactionReceipt) => void;
  /**
   * One-shot actions (claim, createDrop): keep the button disabled after the
   * tx confirms so it can't be re-sent. Leave unset for repeatable actions
   * (fee settings, vault withdraw) that re-send from the same button.
   */
  disableWhenConfirmed?: boolean;
}) {
  const { data: hash, sendTransaction, isPending, error } = useSendTransaction();
  const chainId = useChainId();
  // Pin the chain the tx was actually SENT on: if the wallet switches
  // networks while the tx is pending, the receipt poll and the explorer link
  // must keep pointing at the original chain, not follow the wallet.
  const [sentChainId, setSentChainId] = useState<number | undefined>();
  const { data: receipt, isLoading: mining, isSuccess } =
    useWaitForTransactionReceipt({ hash, chainId: sentChainId });
  const chains = useChains();
  const currentChain = chains.find((c) => c.id === (sentChainId ?? chainId));

  // A mined receipt with status "reverted" still resolves `isSuccess` (the
  // receipt was fetched), so gate the confirmed/failed states — and the
  // onConfirmed callback — on the receipt's actual execution status.
  const confirmed = isSuccess && receipt?.status === "success";
  const reverted = isSuccess && receipt?.status === "reverted";

  // Keep the latest callback in a ref so the success effect depends only on
  // `confirmed` — an inline `onConfirmed` (new identity each render) would
  // otherwise re-fire the effect in a loop once `confirmed` is true.
  const onConfirmedRef = useRef(onConfirmed);
  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
  }, [onConfirmed]);
  useEffect(() => {
    if (confirmed && receipt) onConfirmedRef.current?.(receipt);
  }, [confirmed, receipt]);

  const busy = isPending || mining;

  // The promoted status chip: the five states are mutually exclusive (a send
  // resolves to a hash or rejects to an error, never both, and a new send
  // resets both), so one priority list covers them. The "✓" joins the button
  // label only after on-chain confirmation.
  const status = ((): TxStatus | null => {
    const spinner = <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />;
    if (isPending) {
      return {
        tone: "bg-white border-ink/30 text-ink/70",
        icon: spinner,
        text: "Waiting for wallet…",
      };
    }
    if (error) {
      return {
        tone: "bg-white border-rose-500 text-rose-600",
        icon: <X aria-hidden="true" className="w-4 h-4" />,
        text: "Failed",
        detail: error.message.split("\n")[0],
      };
    }
    if (reverted) {
      return {
        tone: "bg-white border-rose-500 text-rose-600",
        icon: <X aria-hidden="true" className="w-4 h-4" />,
        text: "Reverted",
      };
    }
    if (confirmed) {
      return {
        tone: "bg-pop-mint border-ink text-ink",
        icon: <Check aria-hidden="true" className="w-4 h-4" />,
        text: "Confirmed",
      };
    }
    if (hash) {
      return {
        tone: "bg-pop-sky border-ink text-ink",
        icon: spinner,
        text: mining ? "Pending confirmation…" : "Submitted",
      };
    }
    return null;
  })();

  return (
    <div>
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 text-sm disabled:opacity-50 disabled:pointer-events-none ${
          primary ? inkBtnClass("md") : whiteBtnClass("md")
        }`}
        disabled={
          disabled || busy || !request || (confirmed && disableWhenConfirmed)
        }
        onClick={() => {
          if (!request) return;
          // Write on the wallet's active chain (matching the chain-aware
          // reads), and remember it for the receipt wait above.
          setSentChainId(chainId);
          sendTransaction({
            to: request.to,
            data: request.data,
            value: request.value,
            chainId,
          });
        }}
      >
        {confirmed ? `${label} ✓` : label}
      </button>
      {/* Live status chip + tx hash link AND copy — on explorer-less chains
          (e.g. the local fork) copying is the only way to keep the tx id. */}
      {status && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* The live region covers only the status text + failure detail —
              a live region around the link/copy controls would make screen
              readers re-announce interactive elements on every state change. */}
          <span role="status" className="flex flex-wrap items-center gap-2">
            <span className={`${POP_STATUS_CHIP} ${status.tone}`}>
              {status.icon}
              {status.text}
            </span>
            {status.detail && (
              <span className="text-sm text-rose-600">{status.detail}</span>
            )}
          </span>
          {hash && (
            <span className="flex items-center gap-1 text-sm text-ink/70 font-mono">
              <TxHashLink hash={hash} chain={currentChain} />
              <CopyButton value={hash} label="Copy transaction hash" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
