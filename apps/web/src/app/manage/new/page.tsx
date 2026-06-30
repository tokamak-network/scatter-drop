"use client";

import { useState } from "react";
import { isAddress, parseUnits, type Address, type Hex } from "viem";
import { AirdropType, airdropTypeLabel } from "@tokamak-network/scatter-drop-sdk";
import { PageHeader, StubButton } from "@/components/ui";
import { ConnectGate } from "@/components/ConnectGate";
import { CalldataPreview } from "@/components/CalldataPreview";
import { buildCreateDropRequest, isPositiveDecimal } from "@/lib/calldata";
import { FACTORY_ADDRESS, FEE_BY_TYPE, STANDARD_REGISTRIES } from "@/lib/stub";

const TYPES = [
  AirdropType.CSV,
  AirdropType.ONCHAIN_SNAPSHOT,
  AirdropType.ONCHAIN_GATED,
  AirdropType.SOCIAL,
];

const ZERO_ROOT: Hex = `0x${"0".repeat(64)}`;

export default function NewCampaignPage() {
  const [type, setType] = useState<AirdropType>(AirdropType.CSV);
  const [registry, setRegistry] = useState<Address>(
    STANDARD_REGISTRIES[0]?.address ?? ("0x" as Address),
  );
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [request, setRequest] = useState<{ to: Address; data: Hex } | null>(null);

  const tokenValid = isAddress(token);
  const amountValid = isPositiveDecimal(amount);
  const deadlineParsed = deadline ? Date.parse(deadline) : 0;
  const deadlineUnix = Number.isNaN(deadlineParsed)
    ? 0
    : Math.floor(deadlineParsed / 1000);
  const ready = tokenValid && amountValid && deadlineUnix > 0;

  function prepareCreate() {
    if (!ready) return;
    setRequest(
      buildCreateDropRequest(FACTORY_ADDRESS, {
        type,
        token: token as Address,
        // merkleRoot is produced from the CSV/snapshot in M6; zero placeholder here.
        merkleRoot: ZERO_ROOT,
        totalAmount: parseUnits(amount, 18),
        deadlineUnix: BigInt(deadlineUnix),
        identityRegistry: registry,
      }),
    );
  }

  return (
    <>
      <PageHeader
        title="New Campaign"
        subtitle="Step 0 operator gate · Step 1 basics + CA registry · Step 2 eligibility"
      />

      <ConnectGate prompt="Step 0 — operator identity verification is required to create a campaign. Connect your wallet to begin.">
        <div className="grid" style={{ maxWidth: 640 }}>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Operator identity gate</h3>
            <p className="muted" style={{ margin: 0 }}>
              operatorRegistry.verifiedUntil(you) ≥ now — enforced at createDrop.
              (stub: pass)
            </p>
          </div>

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
              value={registry}
              onChange={(e) => setRegistry(e.target.value as Address)}
            >
              {STANDARD_REGISTRIES.map((r) => (
                <option key={r.id} value={r.address}>
                  {r.label} · {r.trustedCAs} CAs
                </option>
              ))}
            </select>
            <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
              Standard registries shown first — operators usually reuse, not
              create.
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
                  <span className="muted">Fee: {FEE_BY_TYPE[t]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Review &amp; create</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              Fee for {airdropTypeLabel(type)}: {FEE_BY_TYPE[type]} + deposited
              tokens. The Merkle root is generated from your CSV in M6 (zero
              placeholder below).
            </p>
            <button
              className="btn btn-primary"
              disabled={!ready}
              onClick={prepareCreate}
            >
              {request ? "createDrop calldata ready" : "Prepare createDrop"}
            </button>
            {request && (
              <div style={{ marginTop: 12 }}>
                <CalldataPreview
                  title="DropFactory.createDrop(type, token, root, total, deadline, registry)"
                  to={request.to}
                  data={request.data}
                  note="Prepared with SDK dropFactoryAbi — fee payment + send wired in M6."
                />
              </div>
            )}
          </div>

          <StubButton milestone="M6">Submit &amp; pay</StubButton>
        </div>
      </ConnectGate>
    </>
  );
}
