import type { ReactNode } from "react";
import { StatusDot } from "./ui";

type GateState = "loading" | "verified" | "unverified";

const STATUS: Record<GateState, { color: string; label: string }> = {
  loading: { color: "var(--color-text-muted)", label: "checking…" },
  verified: { color: "var(--color-success)", label: "verified" },
  unverified: { color: "var(--color-warning)", label: "not verified" },
};

/**
 * zk-X509 customer identity gate status for a campaign. Verification state is
 * computed by the caller via SDK `isVerificationValid`; this component renders
 * the status and, when unverified, the register CTA (IA §2.1 / §0-2).
 */
export function IdentityGate({
  state,
  registryLabel,
  children,
}: {
  state: GateState;
  registryLabel: string;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div>Identity gate</div>
          <div className="muted" style={{ fontSize: 13 }}>
            zk-X509 registry: {registryLabel}
          </div>
        </div>
        <StatusDot {...STATUS[state]} />
      </div>

      {state === "unverified" && (
        <div style={{ marginTop: 8 }}>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 8px" }}>
            This wallet is not verified in {registryLabel}. Identity
            verification is required before you can claim (self-claim only).
          </p>
          <a
            className="btn"
            href="https://github.com/tokamak-network"
            target="_blank"
            rel="noreferrer"
          >
            Verify with zk-X509 →
          </a>
        </div>
      )}

      {state === "verified" && children}
    </div>
  );
}
