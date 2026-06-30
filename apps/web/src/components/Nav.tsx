"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { WalletConnect } from "./WalletConnect";
import { NavLink } from "./NavLink";
import { useIsAdmin } from "@/lib/stub";

const LINKS = [
  { href: "/campaigns", label: "Explore" },
  { href: "/claim", label: "My Claims" },
  { href: "/manage", label: "Manage" },
];

export function Nav() {
  const { address } = useAccount();
  const isAdmin = useIsAdmin(address);

  const links = isAdmin ? [...LINKS, { href: "/admin", label: "Admin" }] : LINKS;

  return (
    <header
      style={{
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          height: 60,
        }}
      >
        <Link href="/" style={{ fontWeight: 700, letterSpacing: -0.3 }}>
          scatter<span style={{ color: "var(--color-primary)" }}>·</span>drop
        </Link>
        <nav style={{ display: "flex", gap: 4, flex: 1 }}>
          {links.map((l) => (
            <NavLink key={l.href} href={l.href} label={l.label} />
          ))}
        </nav>
        <WalletConnect />
      </div>
    </header>
  );
}
