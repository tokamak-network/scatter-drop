import { createPublicClient, http, isAddress, type Address } from "viem";
import { prisma } from "@/lib/db";
import { scanDropCreated } from "@/lib/dropScan";

/**
 * On-chain guard for linking an announcement to a drop. Without it, anyone
 * could attach a well-known campaign address to their own announcement and
 * borrow its LIVE badge + claim button for a phishing post — so the link is
 * only accepted when the announcement's network actually has a DropCreated
 * for that drop with the announcement's operator. Fail-closed: an unknown
 * network or an unreachable RPC rejects the link.
 */

/**
 * Null when `drop` was created by `operator` (lowercased) on `chainId`'s
 * registered network; otherwise the rejection reason.
 */
export async function verifyDropOperator(
  chainId: number,
  drop: string,
  operator: string,
): Promise<string | null> {
  // The route's input validation already guarantees a lowercased address;
  // this guard keeps the lib safe for future callers and stops a malformed
  // value from reaching the DB/RPC (where a throw would be misreported as a
  // transient RPC failure).
  if (!isAddress(drop)) return "Invalid drop address format";
  const network = await prisma.network.findUnique({ where: { chainId } });
  if (!network?.rpcUrl || /^0x0{40}$/i.test(network.dropFactory)) {
    return "This announcement's network is not registered for on-chain verification";
  }
  try {
    // Explicit timeout so a slow/hanging RPC fails this PATCH closed quickly
    // instead of tying up the request for viem's long default.
    const client = createPublicClient({
      transport: http(network.rpcUrl, { timeout: 10_000, retryCount: 1 }),
    });
    const logs = await scanDropCreated(
      client,
      {
        dropFactory: network.dropFactory as Address,
        deployBlock: network.deployBlock != null ? BigInt(network.deployBlock) : undefined,
      },
      { drop: drop as Address },
    );
    const owned = logs.some((l) => l.operator.toLowerCase() === operator);
    return owned ? null : "Drop not found on-chain for this announcement's operator";
  } catch {
    return "Could not verify the drop on-chain — please retry";
  }
}
