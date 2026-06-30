import { StatusDot } from "./ui";

type EligState = "loading" | "eligible" | "ineligible" | "claimed";

const STATUS: Record<EligState, { color: string; label: string }> = {
  loading: { color: "var(--color-text-muted)", label: "checking eligibility…" },
  eligible: { color: "var(--color-success)", label: "eligible" },
  ineligible: { color: "var(--color-text-muted)", label: "not eligible" },
  claimed: { color: "var(--color-text-muted)", label: "already claimed" },
};

/**
 * Shows the connected wallet's eligibility for a campaign (Merkle proof / on-
 * chain state). Evaluated on the spot in the campaign detail page (IA §2.1).
 */
export function EligibilityCheck({
  state,
  amount,
}: {
  state: EligState;
  amount?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3)",
      }}
    >
      <div>
        <div>Eligibility</div>
        {state === "eligible" && amount && (
          <div className="muted" style={{ fontSize: 13 }}>
            Allocation: {amount}
          </div>
        )}
      </div>
      <StatusDot {...STATUS[state]} />
    </div>
  );
}
