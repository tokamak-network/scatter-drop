"use client";

import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { useIsAdmin } from "@/lib/stub";
import { EmptyState } from "./states";

/**
 * Route-level guard for the `/admin/*` section. Hiding the nav link is not a
 * guard, so this blocks rendering of admin pages for non-admin wallets.
 *
 * Stub: `useIsAdmin` returns false until the real DropFactory.owner() check is
 * wired in M7 (flip the stub to preview the admin UI during development).
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
