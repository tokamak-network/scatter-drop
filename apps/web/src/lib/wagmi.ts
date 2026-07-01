import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain, type Chain } from "viem";
import type { PublicNetwork } from "@/lib/networkTypes";

/**
 * Local dev fork chain. `dev-fork.sh` runs anvil forked from Sepolia with
 * `--chain-id 31337`, keeping Sepolia state but re-labeling the chain id to
 * 31337 so it's distinct from real Sepolia (M1: a wallet on real Sepolia can't
 * receive a fork tx). Overridable via env.
 *
 * Reads `NEXT_PUBLIC_CHAIN_ID` / `NEXT_PUBLIC_RPC_URL` (the names `dev-fork.sh`
 * dumps for copy-paste), falling back to the older `NEXT_PUBLIC_FORK_*` names.
 */
const DEFAULT_FORK_CHAIN_ID = 31337;
// Use || (not ??) so an empty-string env var (NEXT_PUBLIC_CHAIN_ID=) falls
// through to the next source instead of being treated as set.
const parsedChainId = Number(
  process.env.NEXT_PUBLIC_CHAIN_ID || process.env.NEXT_PUBLIC_FORK_CHAIN_ID,
);
const FORK_CHAIN_ID =
  Number.isFinite(parsedChainId) && parsedChainId > 0
    ? parsedChainId
    : DEFAULT_FORK_CHAIN_ID;
export const FORK_RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  process.env.NEXT_PUBLIC_FORK_RPC ||
  "http://127.0.0.1:8545";

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

/** Turn a registered network into a viem chain. */
function toChain(n: PublicNetwork): Chain {
  return defineChain({
    id: n.chainId,
    name: n.name,
    nativeCurrency: { name: n.nativeSymbol, symbol: n.nativeSymbol, decimals: 18 },
    rpcUrls: { default: { http: [n.publicRpcUrl || FORK_RPC_URL] } },
    testnet: true,
  });
}

/**
 * Build a wagmi config from the admin network registry. Falls back to the env
 * `fork` chain when the registry is empty (DB unavailable / no networks yet), so
 * the app keeps working single-chain.
 */
export function buildConfig(networks: PublicNetwork[]): typeof config {
  const chains = (networks.length ? networks.map(toChain) : [fork]) as [Chain, ...Chain[]];
  const transports = Object.fromEntries(
    chains.map((c) => [c.id, http(c.rpcUrls.default.http[0])]),
  );
  // Structurally a Config; cast to the registered config type so WagmiProvider +
  // the typed hooks accept it (the registry can hold any number of chains).
  return createConfig({
    chains,
    connectors: [injected()],
    transports,
    ssr: true,
  }) as unknown as typeof config;
}

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
