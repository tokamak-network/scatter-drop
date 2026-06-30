"use client";

import { useState } from "react";
import { parseUnits, type Address, type Hex } from "viem";
import { CalldataPreview } from "./CalldataPreview";
import { buildWithdrawFeesRequest, isPositiveDecimal } from "@/lib/calldata";

/**
 * Builds `DropFactory.withdrawFees(token, amount)` calldata for the admin Fee
 * Vault. withdrawFees sends to the fixed treasury (per K0 spec — no arbitrary
 * recipient). Send is wired in M7; here we only preview the calldata.
 */
export function VaultWithdraw({
  factory,
  feeToken,
  treasury,
}: {
  factory: Address;
  feeToken: Address;
  treasury: Address;
}) {
  const [amount, setAmount] = useState("");
  const [request, setRequest] = useState<{ to: Address; data: Hex } | null>(null);

  const valid = isPositiveDecimal(amount);

  function prepare() {
    if (!valid) return;
    setRequest(buildWithdrawFeesRequest(factory, feeToken, parseUnits(amount, 18)));
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
        Withdraw amount → treasury {treasury}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="100"
        />
        <button className="btn btn-primary" disabled={!valid} onClick={prepare}>
          Prepare withdraw
        </button>
      </div>
      {request && (
        <div style={{ marginTop: 12 }}>
          <CalldataPreview
            title="DropFactory.withdrawFees(token, amount)"
            to={request.to}
            data={request.data}
            note="Prepared with SDK dropFactoryAbi — admin send wired in M7."
          />
        </div>
      )}
    </div>
  );
}
