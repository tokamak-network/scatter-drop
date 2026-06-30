import { getAddress } from "viem";
import type { AirdropEntry } from "@tokamak-network/scatter-drop-merkle";
import type { AllocationMode, Holder } from "./types.js";

/**
 * Turn snapshot holders into `(address, amount)` airdrop entries per the mode.
 * Output feeds `packages/merkle` buildDrop unchanged. Zero-amount entries are
 * dropped (buildDrop rejects them anyway), addresses are checksummed.
 *
 * - **equal**: every holder gets `perWallet`.
 * - **proRata**: `amount = totalAmount * balance / Σbalance`, integer floor.
 *   Rounding dust (the remainder below the floor) is left undistributed — the
 *   real total is the sum of the floored amounts, never more than `totalAmount`,
 *   so the deposit can never be under-funded. (No "give dust to the largest"
 *   surprise; the wizard shows the actual total.)
 */
export function allocate(holders: Holder[], mode: AllocationMode): AirdropEntry[] {
  if (mode.kind === "equal") {
    if (mode.perWallet <= 0n) throw new Error("allocate(equal): perWallet must be > 0");
    return holders.map((h) => ({ account: getAddress(h.address), amount: mode.perWallet }));
  }

  // proRata
  if (mode.totalAmount <= 0n) throw new Error("allocate(proRata): totalAmount must be > 0");
  const sum = holders.reduce((acc, h) => acc + h.balance, 0n);
  if (sum <= 0n) throw new Error("allocate(proRata): total balance is zero");

  const entries: AirdropEntry[] = [];
  for (const h of holders) {
    const amount = (mode.totalAmount * h.balance) / sum; // floor
    if (amount > 0n) entries.push({ account: getAddress(h.address), amount });
  }
  return entries;
}

/** Sum the amounts of allocation entries (the actual deposit total). */
export function totalOf(entries: AirdropEntry[]): bigint {
  return entries.reduce((acc, e) => acc + e.amount, 0n);
}
