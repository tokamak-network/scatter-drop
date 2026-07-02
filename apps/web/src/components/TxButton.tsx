"use client";

import { useEffect, useRef } from "react";
import {
  useChainId,
  useChains,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import type { Address, Hex } from "viem";
import { explorerUrl } from "@/lib/explorer";

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
}: {
  request?: { to: Address; data: Hex; value?: bigint } | null;
  label: string;
  disabled?: boolean;
  primary?: boolean;
  onConfirmed?: () => void;
}) {
  const { data: hash, sendTransaction, isPending, error } = useSendTransaction();
  const { data: receipt, isLoading: mining, isSuccess } =
    useWaitForTransactionReceipt({ hash });
  const chainId = useChainId();
  const chains = useChains();
  // Resolve the chain from the active chainId (the chain the tx is sent on),
  // not the wallet's connected chain — the two can diverge.
  const currentChain = chains.find((c) => c.id === chainId);

  // A mined receipt with status "reverted" still resolves `isSuccess` (the
  // receipt was fetched), so gate the confirmed/failed states — and the
  // onConfirmed callback — on the receipt's actual execution status.
  const confirmed = isSuccess && receipt?.status === "success";
  const reverted = isSuccess && receipt?.status === "reverted";

  // Explorer link for the submitted tx so the user can track it and keep a
  // record of the result (the helper returns undefined until a hash exists).
  const txUrl = explorerUrl(currentChain, "tx", hash);

  // Keep the latest callback in a ref so the success effect depends only on
  // `confirmed` — an inline `onConfirmed` (new identity each render) would
  // otherwise re-fire the effect in a loop once `confirmed` is true.
  const onConfirmedRef = useRef(onConfirmed);
  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
  }, [onConfirmed]);
  useEffect(() => {
    if (confirmed) onConfirmedRef.current?.();
  }, [confirmed]);

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
        className={primary ? "btn btn-primary" : "btn"}
        disabled={disabled || busy || !request}
        onClick={() =>
          request &&
          // Write on the wallet's active chain (matching the chain-aware reads).
          sendTransaction({
            to: request.to,
            data: request.data,
            value: request.value,
            chainId,
          })
        }
      >
        {text}
      </button>
      {/* Live tx status + explorer link, shown as soon as a hash exists so the
          user can track progress and keep the result's transaction link. */}
      {hash && (
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          <span
            style={
              confirmed
                ? { color: "var(--color-success)" }
                : reverted
                  ? { color: "var(--color-danger)" }
                  : undefined
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
          {txUrl && (
            <>
              {" · "}
              <a
                href={txUrl}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-600 hover:underline"
              >
                View transaction ↗
              </a>
            </>
          )}
        </div>
      )}
      {error && (
        <div
          className="muted"
          style={{ color: "var(--color-danger)", fontSize: 12, marginTop: 4 }}
        >
          {error.message.split("\n")[0]}
        </div>
      )}
    </div>
  );
}
