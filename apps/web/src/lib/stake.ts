import { createPublicClient, http, parseAbi, type Address } from "viem";
import { mainnet } from "viem/chains";

/**
 * Tokamak staking snapshot — client-side. A staked balance can't be read like
 * an ERC-20/NFT holder: it's a seigniorage-inclusive view (`stakeOf`), so we
 * call it per candidate at a chosen block. The operator supplies their own
 * archive RPC URL and the eth_calls run in the browser (multicall, batched), so
 * the app needs no server RPC key. Candidate addresses come from the
 * DepositManager `Deposited` event (extracted via the Dune import).
 */

/** Tokamak DepositManager (mainnet) — emits `Deposited(layer2, depositor, amount)`. */
export const DEPOSIT_MANAGER: Address = "0x0b58ca72b12f01fc05f8f252e226f3e2089bd00e";
/**
 * Tokamak SeigManager — `stakeOf(account)` returns the account's total staked
 * WTON across all layer2s, seigniorage-inclusive, in 27-decimal (RAY) units.
 */
export const SEIG_MANAGER: Address = "0x0b55a0f463b6defb81c6063973763951712d0e5f";
/** SeigManager staked balances are RAY (27-decimal) fixed-point. */
export const STAKE_DECIMALS = 27;

const seigAbi = parseAbi(["function stakeOf(address account) view returns (uint256)"]);
/** Default stakeOf calls per multicall request when the caller doesn't choose. */
export const DEFAULT_BATCH = 400;
/** Bounds on the operator-chosen batch size (1 call .. one big multicall). */
export const MIN_BATCH = 1;
export const MAX_BATCH = 2000;

export type StakeRow = { address: string; amount: string };

/**
 * Read `stakeOf(account)` for every candidate over the operator's RPC
 * (multicall, batched), keeping accounts whose stake is > 0 and ≥ `minStake`.
 * When `block` is given, reads that historical block (needs an archive node);
 * omit it to read current state (`latest`), which a public RPC can serve.
 * Amounts are the raw 27-decimal staked-WTON values — usable directly as a
 * pro-rata weight. `onProgress` reports addresses processed so the UI can show a
 * bar; a rejected batch (network error) aborts the whole snapshot. Individual
 * `stakeOf` calls that revert are counted in `failed` so the caller can warn
 * that the snapshot is incomplete rather than silently dropping stakers.
 */
export async function snapshotStakes(opts: {
  rpcUrl: string;
  addresses: string[];
  /** Historical block to snapshot at; omit for current state (`latest`). */
  block?: bigint;
  minStake: bigint;
  /** stakeOf calls per multicall request; clamped to [MIN_BATCH, MAX_BATCH]. */
  batchSize?: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ rows: StakeRow[]; failed: number }> {
  const { rpcUrl, addresses, block, minStake, onProgress } = opts;
  const batch = Math.max(
    MIN_BATCH,
    Math.min(MAX_BATCH, Math.floor(opts.batchSize ?? DEFAULT_BATCH)),
  );
  // mainnet chain config carries the canonical multicall3 address; the RPC must
  // serve mainnet state (archive when a historical `block` is pinned).
  const client = createPublicClient({ chain: mainnet, transport: http(rpcUrl) });
  // Pin the block only when snapshotting history; otherwise read latest.
  const at = block !== undefined ? { blockNumber: block } : {};

  // Keep amounts as bigint while collecting so the sort compares numerically
  // without re-parsing each string; stringify once at the end.
  const kept: { address: string; amount: bigint }[] = [];
  let failed = 0;
  for (let i = 0; i < addresses.length; i += batch) {
    const chunk = addresses.slice(i, i + batch);
    const res = await client.multicall({
      contracts: chunk.map((a) => ({
        address: SEIG_MANAGER,
        abi: seigAbi,
        functionName: "stakeOf",
        args: [a as Address],
      })),
      ...at,
      allowFailure: true,
    });
    chunk.forEach((a, j) => {
      const r = res[j];
      if (r.status === "success") {
        const stake = r.result as bigint;
        if (stake > 0n && stake >= minStake) kept.push({ address: a, amount: stake });
      } else {
        // Count reverted calls instead of silently dropping — the caller warns.
        failed += 1;
      }
    });
    onProgress?.(Math.min(i + batch, addresses.length), addresses.length);
  }

  kept.sort((x, y) => (y.amount > x.amount ? 1 : y.amount < x.amount ? -1 : 0));
  return { rows: kept.map((r) => ({ address: r.address, amount: r.amount.toString() })), failed };
}
