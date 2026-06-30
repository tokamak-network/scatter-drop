import { AirdropType, airdropTypeLabel } from "@tokamak-network/scatter-drop-sdk";
import { PageHeader, StubButton } from "@/components/ui";
import { FEE_BY_TYPE, getAdminOverview } from "@/lib/stub";

const TYPES = [
  AirdropType.CSV,
  AirdropType.ONCHAIN_SNAPSHOT,
  AirdropType.ONCHAIN_GATED,
  AirdropType.SOCIAL,
];

export default async function AdminFundsPage() {
  const { feeToken } = await getAdminOverview();

  return (
    <>
      <PageHeader
        title="Campaign Funds"
        subtitle="Per-type creation fees (setFee) and fee token."
      />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="muted" style={{ fontSize: 13 }}>
          Fee token (setFeeToken)
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
          {feeToken}
        </div>
      </div>
      <div className="grid grid-cols-2">
        {TYPES.map((t) => (
          <div key={t} className="card">
            <div className="muted" style={{ fontSize: 13 }}>
              {airdropTypeLabel(t)}
            </div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{FEE_BY_TYPE[t]}</div>
            <div style={{ marginTop: 8 }}>
              <StubButton milestone="M7">setFee</StubButton>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
