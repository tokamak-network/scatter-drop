import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

/**
 * Local anvil chain (Foundry default). Used for E2E against the zk-X509 /
 * DropFactory contracts deployed by the M3 seed scripts.
 */
export const anvil = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
  testnet: true,
});

/** Single source of truth for supported chains (used by config + NetworkBanner). */
export const SUPPORTED_CHAINS = [mainnet, anvil] as const;
export const SUPPORTED_CHAIN_IDS: number[] = SUPPORTED_CHAINS.map((c) => c.id);

export const config = createConfig({
  chains: SUPPORTED_CHAINS,
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(),
    [anvil.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
