"use client";

import { useState } from "react";
import { isAddress, parseUnits, type Address, type Hex } from "viem";
import {
  AirdropType,
  airdropTypeLabel,
  buildApproveRequest,
  buildCreateDropRequest,
  getZkX509,
} from "@tokamak-network/scatter-drop-sdk";
import { PageHeader } from "@/components/ui";
import { ConnectGate } from "@/components/ConnectGate";
import { TxButton } from "@/components/TxButton";
import { isPositiveDecimal } from "@/lib/validation";
import { deploymentIssue, useDeployment, useFeeOf } from "@/lib/contracts";

const TYPES = [
  AirdropType.CSV,
  AirdropType.ONCHAIN_SNAPSHOT,
  AirdropType.ONCHAIN_GATED,
  AirdropType.SOCIAL,
];

const ZERO_ROOT: Hex = `0x${"0".repeat(64)}`;

export default function NewCampaignPage() {
  const { data: dep, isLoading: depLoading } = useDeployment();
  const factory = dep?.dropFactory;
  const feeToken = dep?.feeToken;
  const registries = dep ? getZkX509(dep.chainId) : undefined;
  const depIssue = deploymentIssue(dep, depLoading);

  const [type, setType] = useState<AirdropType>(AirdropType.CSV);
  const [registry, setRegistry] = useState<Address | "">("");
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [deadline, setDeadline] = useState("");

  const { data: fee } = useFeeOf(factory, type);

  const tokenValid = isAddress(token);
  const amountValid = isPositiveDecimal(amount);
  const deadlineParsed = deadline ? Date.parse(`${deadline}T00:00:00Z`) : 0;
  const deadlineUnix = Number.isNaN(deadlineParsed)
    ? 0
    : Math.floor(deadlineParsed / 1000);
  const registryAddr = (registry || registries?.usersRegistry) as
    | Address
    | undefined;
  const ready =
    !!factory && tokenValid && amountValid && deadlineUnix > 0 && !!registryAddr;

  const totalAmount = amountValid ? parseUnits(amount, 18) : 0n;

  const approveFeeReq =
    factory && feeToken && fee !== undefined
      ? buildApproveRequest(feeToken, factory, fee)
      : null;
  const approveTokenReq =
    factory && tokenValid && amountValid
      ? buildApproveRequest(token as Address, factory, totalAmount)
      : null;
  const createReq = ready
    ? buildCreateDropRequest(factory, {
        airdropType: type,
        airdropToken: token as Address,
        // merkleRoot comes from the CSV/snapshot pipeline in M6; zero placeholder.
        merkleRoot: ZERO_ROOT,
        totalAmount,
        deadline: BigInt(deadlineUnix),
        identityRegistry: registryAddr,
      })
    : null;

  return (
    <>
      <PageHeader
        title="New Campaign"
        subtitle="Operator gate · basics + CA registry · eligibility type · approve & create"
      />

      <ConnectGate prompt="Step 0 — operator identity verification is required to create a campaign. Connect your wallet to begin.">
        {depIssue || !factory ? (
          <p className="muted">{depIssue ?? "No deployment configured."}</p>
        ) : (
          <div className="grid" style={{ maxWidth: 640 }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Basics</h3>
              <label className="label">Distribution token (address)</label>
              <input
                className="input"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="0x…"
              />
              {token && !tokenValid && (
                <div style={{ fontSize: 12, color: "var(--color-danger)", marginTop: 4 }}>
                  Not a valid address.
                </div>
              )}
              <label className="label">Total amount</label>
              <input
                className="input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1000000"
              />
              <label className="label">Deadline</label>
              <input
                className="input"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Customer CA Registry *</h3>
              <select
                className="input"
                value={registryAddr ?? ""}
                onChange={(e) => setRegistry(e.target.value as Address)}
              >
                {registries?.usersRegistry && (
                  <option value={registries.usersRegistry}>
                    Users registry (standard) · {registries.usersRegistry}
                  </option>
                )}
                {registries?.relayersRegistry && (
                  <option value={registries.relayersRegistry}>
                    Relayers registry · {registries.relayersRegistry}
                  </option>
                )}
              </select>
              <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
                Validated on-chain by RegistryFactory.isRegistry at createDrop.
              </p>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Eligibility type</h3>
              <div style={{ display: "grid", gap: 8 }}>
                {TYPES.map((t) => (
                  <label
                    key={t}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      border: `1px solid ${type === t ? "var(--color-primary)" : "var(--color-border)"}`,
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                  >
                    <span>
                      <input
                        type="radio"
                        name="type"
                        checked={type === t}
                        onChange={() => setType(t)}
                        style={{ marginRight: 8 }}
                      />
                      {airdropTypeLabel(t)}
                    </span>
                    <span className="muted">
                      Fee: {fee !== undefined && type === t ? fee.toString() : "—"}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Approve &amp; create</h3>
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                Approve the fee token and the distribution token to the factory,
                then create. The Merkle root is generated from your CSV in M6
                (zero placeholder).
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                <TxButton request={approveFeeReq} label="1. Approve fee token" disabled={!approveFeeReq} />
                <TxButton request={approveTokenReq} label="2. Approve distribution token" disabled={!approveTokenReq} />
                <TxButton request={createReq} label="3. Create campaign" primary disabled={!createReq} />
              </div>
            </div>
          </div>
        )}
      </ConnectGate>
    </>
  );
}
