import { PageHeader } from "@/components/ui";
import { VaultWithdraw } from "@/components/VaultWithdraw";

export default function AdminVaultPage() {
  return (
    <>
      <PageHeader
        title="Fee Vault"
        subtitle="Collected creation fees. Withdraw to treasury (admin only)."
      />
      <div className="card">
        <VaultWithdraw />
      </div>
    </>
  );
}
