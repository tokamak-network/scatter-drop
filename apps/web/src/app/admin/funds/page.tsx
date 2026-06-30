import { PageHeader, StubButton } from "@/components/ui";
import { FEE_BY_TYPE, type AirdropType } from "@/lib/stub";

export default function AdminFundsPage() {
  const types = Object.keys(FEE_BY_TYPE) as AirdropType[];

  return (
    <>
      <PageHeader
        title="Campaign Funds"
        subtitle="Per-type creation fees (setFee) and fee token."
      />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="muted" style={{ fontSize: 13 }}>
          Fee token
        </div>
        <div>0xFeeToken… (setFeeToken)</div>
      </div>
      <div className="grid grid-cols-2">
        {types.map((t) => (
          <div key={t} className="card">
            <div className="muted" style={{ fontSize: 13 }}>
              {t}
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
