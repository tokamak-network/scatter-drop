"use client";

import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { useIsAdmin } from "@/lib/contracts";
import { EmptyState } from "./states";

/**
 * Route-level guard for the `/admin/*` section. Hiding the nav link is not a
 * guard, so this blocks rendering of admin pages for non-admin wallets.
 * Admin = the deployment deployer (DropFactory owner) via useIsAdmin.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { address } = useAccount();
  const isAdmin = useIsAdmin(address);

  if (!isAdmin) {
    return (
      <EmptyState
        title="Admin access required"
        description="This area is restricted to the platform admin wallet (DropFactory owner)."
        action={{ href: "/campaigns", label: "Back to Explore" }}
      />
    );
  }

  return <>{children}</>;
}
