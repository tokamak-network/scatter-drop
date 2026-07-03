import { createPublicClient, http, isAddress, type Address, type Hex } from "viem";
import { prisma } from "@/lib/db";
import { findDropCreated, scanDropCreated } from "@/lib/dropScan";
import { TX_HASH_RE } from "./apiInput";

/**
 * On-chain guard for claiming a drop in off-chain stores (linking an
 * announcement, publishing campaign metadata). Without it, anyone could
 * attach a well-known campaign address to their own record — borrowing its
 * LIVE badge + claim button for a phishing post, or squatting a new drop's
 * name — so the claim is only accepted when the record's network actually has
 * a DropCreated for that drop with the record's operator. Fail-closed: an
 * unknown network or an unreachable RPC rejects.
 */

/**
 * Null when `drop` was created by `operator` (lowercased) on `chainId`'s
 * registered network; otherwise the rejection reason.
 *
 * `txHash` (the creation transaction, when the caller holds the receipt) is
 * the O(1) fast path: one getTransactionReceipt instead of a log scan, and
 * immune to provider `eth_getLogs` range caps on long-lived networks. It is
 * normalized here (raw body value welcome); a missing/inconclusive receipt
 * falls back to the bounded scan rather than failing — a wrong hash must not
 * reject a legitimately owned drop.
 */
export async function verifyDropOperator(
  chainId: number,
  drop: string,
  operator: string,
  txHash?: unknown,
): Promise<string | null> {
  // The routes' input validation already guarantees lowercased addresses;
  // normalizing + validating here keeps the lib safe for future callers
  // (a checksummed input must not fail the case-sensitive comparisons or
  // burn an RPC round-trip) and stops malformed values from reaching the
  // DB/RPC, where a throw would be misreported as a transient RPC failure.
  if (!isAddress(drop)) return "Invalid drop address format";
  if (!isAddress(operator)) return "Invalid operator address format";
  const lowerDrop = drop.toLowerCase() as Address;
  const lowerOperator = operator.toLowerCase();
  const network = await prisma.network.findUnique({ where: { chainId } });
  if (!network?.rpcUrl || /^0x0{40}$/i.test(network.dropFactory)) {
    return "This network is not registered for on-chain verification";
  }
  const factory = network.dropFactory as Address;
  try {
    // Explicit timeout so a slow/hanging RPC fails the write closed quickly
    // instead of tying up the request for viem's long default.
    const client = createPublicClient({
      transport: http(network.rpcUrl, { timeout: 10_000, retryCount: 1 }),
    });

    const hash = typeof txHash === "string" ? txHash.toLowerCase() : "";
    if (TX_HASH_RE.test(hash)) {
      try {
        const receipt = await client.getTransactionReceipt({ hash: hash as Hex });
        const created = receipt.status === "success" ? findDropCreated(receipt.logs, factory) : null;
        if (
          created &&
          created.drop.toLowerCase() === lowerDrop &&
          created.operator.toLowerCase() === lowerOperator
        ) {
          return null;
        }
        /* receipt didn't prove it — fall through to the scan */
      } catch {
        /* receipt not found — fall through to the scan */
      }
    }

    const logs = await scanDropCreated(
      client,
      {
        dropFactory: factory,
        deployBlock: network.deployBlock != null ? BigInt(network.deployBlock) : undefined,
      },
      { drop: lowerDrop },
    );
    const owned = logs.some((l) => l.operator.toLowerCase() === lowerOperator);
    return owned ? null : "Drop not found on-chain for this operator";
  } catch {
    return "Could not verify the drop on-chain — please retry";
  }
}
