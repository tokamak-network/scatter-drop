import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

/**
 * Local dev fork chain. `dev-fork.sh` runs `anvil --fork-url $SEPOLIA_RPC_URL`,
 * so the fork keeps Sepolia's chain id (11155111) by default but is served from
 * a local RPC. Both are overridable via env for a plain anvil (31337) run.
 */
const FORK_CHAIN_ID = Number(process.env.NEXT_PUBLIC_FORK_CHAIN_ID ?? 11155111);
export const FORK_RPC_URL =
  process.env.NEXT_PUBLIC_FORK_RPC ?? "http://127.0.0.1:8545";

export const fork = defineChain({
  id: FORK_CHAIN_ID,
  name: "Local Fork",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [FORK_RPC_URL] },
  },
  testnet: true,
});

/**
 * Single source of truth for supported chains (used by config + NetworkBanner).
 * M5 is fork-only: reads and writes both target `fork`, so mainnet is
 * intentionally excluded — a wallet on another chain is flagged and gated.
 */
export const SUPPORTED_CHAINS = [fork] as const;
export const SUPPORTED_CHAIN_IDS: number[] = SUPPORTED_CHAINS.map((c) => c.id);

export const config = createConfig({
  chains: SUPPORTED_CHAINS,
  connectors: [injected()],
  transports: {
    [fork.id]: http(FORK_RPC_URL),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
