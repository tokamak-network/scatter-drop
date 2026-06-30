"use client";

import { useEffect, useRef } from "react";
import { useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import type { Address, Hex } from "viem";
import { fork } from "@/lib/wagmi";

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
  request?: { to: Address; data: Hex } | null;
  label: string;
  disabled?: boolean;
  primary?: boolean;
  onConfirmed?: () => void;
}) {
  const { data: hash, sendTransaction, isPending, error } = useSendTransaction();
  const { isLoading: mining, isSuccess } = useWaitForTransactionReceipt({ hash });

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
          // Pin the write to the fork so it cannot broadcast to whatever chain
          // the wallet happens to be on (reads are pinned to the same chain).
          sendTransaction({ to: request.to, data: request.data, chainId: fork.id })
        }
      >
        {text}
      </button>
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
