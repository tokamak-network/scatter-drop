"use client";

import { useEffect, useRef } from "react";
import {
  useAccount,
  useChainId,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import type { Address, Hex } from "viem";

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
  const { isLoading: mining, isSuccess } = useWaitForTransactionReceipt({ hash });
  const chainId = useChainId();
  const { chain } = useAccount();
  const explorer = chain?.blockExplorers?.default?.url;

  // Keep the latest callback in a ref so the success effect depends only on
  // `isSuccess` — an inline `onConfirmed` (new identity each render) would
  // otherwise re-fire the effect in a loop once `isSuccess` is true.
  const onConfirmedRef = useRef(onConfirmed);
  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
  }, [onConfirmed]);
  useEffect(() => {
    if (isSuccess) onConfirmedRef.current?.();
  }, [isSuccess]);

  const busy = isPending || mining;
  const text = isPending
    ? "Confirm in wallet…"
    : mining
      ? "Pending…"
      : isSuccess
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
      {hash && (
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          {mining ? "tx pending" : isSuccess ? "tx confirmed" : "tx sent"}:{" "}
          {explorer ? (
            <a
              href={`${explorer.replace(/\/$/, "")}/tx/${hash}`}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: "underline" }}
            >
              {hash.slice(0, 10)}…{hash.slice(-8)} ↗
            </a>
          ) : (
            <span style={{ fontFamily: "monospace" }}>
              {hash.slice(0, 10)}…{hash.slice(-8)}
            </span>
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
