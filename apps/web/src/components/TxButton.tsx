"use client";

import { useEffect, useRef } from "react";
import {
  useAccount,
  useChainId,
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
  const { isLoading: mining, isSuccess } = useWaitForTransactionReceipt({ hash });
  const chainId = useChainId();
  const { chain } = useAccount();

  // Explorer link for the submitted tx so the user can track it and keep a
  // record of the result — only once a hash exists (no work pre-send).
  const txUrl = hash ? explorerUrl(chain, "tx", hash) : undefined;

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
      {/* Live tx status + explorer link, shown as soon as a hash exists so the
          user can track progress and keep the result's transaction link. */}
      {hash && (
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          <span style={isSuccess ? { color: "var(--color-success)" } : undefined}>
            {mining ? "Pending confirmation…" : isSuccess ? "Confirmed ✓" : "Submitted"}
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
