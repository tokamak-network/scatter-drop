import { PageHeader, StubButton } from "@/components/ui";
import { getAdminOverview } from "@/lib/stub";

export default async function AdminVaultPage() {
  const { collectedFees } = await getAdminOverview();

  return (
    <>
      <PageHeader
        title="Fee Vault"
        subtitle="Collected creation fees. Withdraw to treasury (admin only)."
      />
      <div className="card">
        <div className="muted" style={{ fontSize: 13 }}>
          collectedFees (FEE token)
        </div>
        <div style={{ fontSize: 24, fontWeight: 600 }}>{collectedFees}</div>
        <div style={{ marginTop: 12 }}>
          <StubButton milestone="M7" primary>
            Withdraw to treasury
          </StubButton>
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          withdrawFees(token, amount) → fixed treasury (per K0 spec).
        </p>
      </div>
    </>
  );
}
