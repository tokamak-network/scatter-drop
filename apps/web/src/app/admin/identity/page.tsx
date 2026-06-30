import { PageHeader, StubButton } from "@/components/ui";
import { STANDARD_REGISTRIES } from "@/lib/stub";

export default function AdminIdentityPage() {
  return (
    <>
      <PageHeader
        title="Identity Registries"
        subtitle="Operator gate + curated standard customer registries."
      />

      <section style={{ marginBottom: 24 }}>
        <h3>Operator Gate</h3>
        <div className="card">
          <div className="muted" style={{ fontSize: 13 }}>
            operatorRegistry
          </div>
          <div>0xOperatorRegistry…</div>
          <div style={{ marginTop: 8 }}>
            <StubButton milestone="M7">setOperatorRegistry</StubButton>
          </div>
        </div>
      </section>

      <section>
        <h3>Standard (customer) registries</h3>
        <div className="grid">
          {STANDARD_REGISTRIES.map((r) => (
            <div
              key={r.id}
              className="card"
              style={{ display: "flex", justifyContent: "space-between" }}
            >
              <span>{r.label}</span>
              <span className="muted">{r.trustedCAs} CAs</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
