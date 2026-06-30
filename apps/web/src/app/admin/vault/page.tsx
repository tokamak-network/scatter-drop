import { PageHeader } from "@/components/ui";
import { VaultWithdraw } from "@/components/VaultWithdraw";
import { FACTORY_ADDRESS, getAdminOverview } from "@/lib/stub";

export default async function AdminVaultPage() {
  const { collectedFees, feeToken, treasury } = await getAdminOverview();

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
        <VaultWithdraw
          factory={FACTORY_ADDRESS}
          feeToken={feeToken}
          treasury={treasury}
        />
        <p className="muted" style={{ fontSize: 12, margin: "12px 0 0" }}>
          withdrawFees(token, amount) → fixed treasury (per K0 spec).
        </p>
      </div>
    </>
  );
}
