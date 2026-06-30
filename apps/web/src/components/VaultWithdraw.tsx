"use client";

import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { buildWithdrawFeesRequest } from "@tokamak-network/scatter-drop-sdk";
import { TxButton } from "./TxButton";
import { isPositiveDecimal } from "@/lib/validation";
import { deploymentIssue, useCollectedFees, useDeployment } from "@/lib/contracts";

/**
 * Admin Fee Vault — live `collectedFees` read and a real
 * `DropFactory.withdrawFees(token, amount)` transaction (sends to the fixed
 * treasury per the contract). Calldata built with the SDK.
 */
export function VaultWithdraw() {
  const { data: dep, isLoading } = useDeployment();
  const factory = dep?.dropFactory;
  const feeToken = dep?.feeToken;
  const treasury = dep?.treasury;

  const { data: collected, refetch } = useCollectedFees(factory, feeToken);
  const [amount, setAmount] = useState("");

  const issue = deploymentIssue(dep, isLoading);
  if (issue || !factory || !feeToken) {
    return (
      <p className="muted">
        {issue ?? "Deployment is missing a fee token; cannot withdraw."}
      </p>
    );
  }

  const valid = isPositiveDecimal(amount);
  const request = valid
    ? buildWithdrawFeesRequest(factory, feeToken, parseUnits(amount, 18))
    : null;

  return (
    <div>
      <div className="muted" style={{ fontSize: 13 }}>
        collectedFees ({feeToken})
      </div>
      <div style={{ fontSize: 24, fontWeight: 600 }}>
        {collected === undefined ? "…" : formatUnits(collected, 18)}
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <input
          className="input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="100"
        />
        <TxButton
          request={request}
          label="Withdraw to treasury"
          primary
          disabled={!valid}
          onConfirmed={() => {
            setAmount("");
            void refetch();
          }}
        />
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
        withdrawFees(token, amount) → fixed treasury {treasury ?? "(unset)"}.
      </p>
    </div>
  );
}
