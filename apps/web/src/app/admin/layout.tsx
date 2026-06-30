import { NavLink } from "@/components/NavLink";
import { AdminGate } from "@/components/AdminGate";

const ADMIN_LINKS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/funds", label: "Campaign Funds" },
  { href: "/admin/identity", label: "Identity Registries" },
  { href: "/admin/vault", label: "Fee Vault" },
  { href: "/admin/campaigns", label: "Campaigns" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 32 }}>
      <aside>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          ADMIN
        </div>
        <nav style={{ display: "grid", gap: 2 }}>
          {ADMIN_LINKS.map((l) => (
            <NavLink key={l.href} href={l.href} label={l.label} exact={l.exact} />
          ))}
        </nav>
      </aside>
      <div>
        <AdminGate>{children}</AdminGate>
      </div>
    </div>
  );
}
