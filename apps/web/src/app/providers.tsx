"use client";

import { type ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildConfig } from "@/lib/wagmi";
import type { PublicNetwork } from "@/lib/networkTypes";

export function Providers({
  children,
  networks,
}: {
  children: ReactNode;
  networks: PublicNetwork[];
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [config] = useState(() => buildConfig(networks));

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
