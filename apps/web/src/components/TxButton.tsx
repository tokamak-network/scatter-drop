"use client";

import { useEffect, useRef, useState } from "react";
import {
  useChainId,
  useChains,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import type { Address, Hex, TransactionReceipt } from "viem";
import { inkBtnClass, whiteBtnClass } from "@/components/pop";
import { TxHashLink } from "@/components/TxHashLink";

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
  const text = isPending
    ? "Confirm in wallet…"
    : mining
      ? "Pending…"
      : confirmed
        ? `${label} ✓`
        : label;

  return (
    <div>
      <button
        className={`text-sm disabled:opacity-50 disabled:pointer-events-none ${
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
        {text}
      </button>
      {/* Live tx status + explorer link, shown as soon as a hash exists so the
          user can track progress and keep the result's transaction link. */}
      {hash && (
        <div className="text-xs text-ink/60 mt-1">
          <span
            className={
              confirmed ? "text-ink font-semibold" : reverted ? "text-rose-500 font-semibold" : undefined
            }
          >
            {mining
              ? "Pending confirmation…"
              : confirmed
                ? "Confirmed ✓"
                : reverted
                  ? "Reverted ✗"
                  : "Submitted"}
          </span>
          {" · "}
          <TxHashLink hash={hash} chain={currentChain} />
        </div>
      )}
      {error && (
        <div className="text-xs text-rose-500 mt-1">{error.message.split("\n")[0]}</div>
      )}
    </div>
  );
}
