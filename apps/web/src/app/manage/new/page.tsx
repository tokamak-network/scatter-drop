"use client";

import { useState } from "react";
import { PageHeader, StubButton } from "@/components/ui";
import { ConnectGate } from "@/components/ConnectGate";
import {
  FEE_BY_TYPE,
  STANDARD_REGISTRIES,
  type AirdropType,
} from "@/lib/stub";

const TYPES: { value: AirdropType; label: string }[] = [
  { value: "CSV", label: "CSV upload" },
  { value: "ONCHAIN_SNAPSHOT", label: "Rule: snapshot" },
  { value: "ONCHAIN_GATED", label: "Rule: on-chain gated" },
  { value: "SOCIAL", label: "Social / tasks" },
];

export default function NewCampaignPage() {
  const [type, setType] = useState<AirdropType>("CSV");
  const [registry, setRegistry] = useState(STANDARD_REGISTRIES[0]?.id ?? "");

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
            <h3 style={{ marginTop: 0 }}>Customer CA Registry *</h3>
            <select
              value={registry}
              onChange={(e) => setRegistry(e.target.value)}
              style={selectStyle}
            >
              {STANDARD_REGISTRIES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} · {r.trustedCAs} CAs
                </option>
              ))}
            </select>
            <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
              Standard registries shown first — operators usually reuse, not
              create.
            </p>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Eligibility type</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {TYPES.map((t) => (
                <label
                  key={t.value}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    border: `1px solid ${type === t.value ? "var(--color-primary)" : "var(--color-border)"}`,
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  <span>
                    <input
                      type="radio"
                      name="type"
                      checked={type === t.value}
                      onChange={() => setType(t.value)}
                      style={{ marginRight: 8 }}
                    />
                    {t.label}
                  </span>
                  <span className="muted">Fee: {FEE_BY_TYPE[t.value]}</span>
                </label>
              ))}
            </div>
          </div>

          <StubButton milestone="M6" primary>
            Continue
          </StubButton>
        </div>
      </ConnectGate>
    </>
  );
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  marginBottom: 8,
  background: "var(--color-surface-2)",
  color: "var(--color-text)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
};
