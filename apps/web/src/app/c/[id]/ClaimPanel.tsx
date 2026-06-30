"use client";

import { StubButton } from "@/components/ui";
import { ConnectGate } from "@/components/ConnectGate";
import type { Campaign } from "@/lib/stub";

/**
 * Claim flow shell (stub). Wires up in M5:
 *   IdentityGate  → identityRegistry.verifiedUntil(claimer) >= now
 *   EligibilityCheck → Merkle proof lookup / on-chain state
 *   claim()       → MerkleDrop.claim(index, account, amount, proof)
 */
export function ClaimPanel({ campaign }: { campaign: Campaign }) {
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Claim</h3>

      <ConnectGate prompt="Connect a wallet to check your eligibility.">
        <div style={{ display: "grid", gap: 12 }}>
          <GateRow
            label="Identity gate"
            detail={`Verified in ${campaign.identityRegistry}`}
          />
          <GateRow label="Eligibility" detail="Merkle proof check" />
          <StubButton milestone="M5" primary>
            Claim
          </StubButton>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Claim requires (identity verified) AND (eligible). Self-claim only.
          </p>
        </div>
      </ConnectGate>
    </div>
  );
}

function GateRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 12px",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
      }}
    >
      <div>
        <div>{label}</div>
        <div className="muted" style={{ fontSize: 13 }}>
          {detail}
        </div>
      </div>
      <span className="muted" style={{ fontSize: 12 }}>
        stub
      </span>
    </div>
  );
}
