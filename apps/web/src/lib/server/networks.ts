import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/db";
import type { PublicNetwork } from "@/lib/networkTypes";

/**
 * Enabled networks that are usable from the browser (have a `publicRpcUrl`),
 * sanitized — the server `rpcUrl` is never selected, let alone returned. Returns
 * [] when the DB is unavailable so the app falls back to the env fork chain.
 * `noStore()` opts out of static baking so registry changes take effect at runtime.
 */
export async function getPublicNetworks(): Promise<PublicNetwork[]> {
  noStore();
  try {
    const nets = await prisma.network.findMany({
      where: { enabled: true, NOT: { publicRpcUrl: null } },
      orderBy: { name: "asc" },
      select: {
        chainId: true,
        name: true,
        publicRpcUrl: true,
        explorerUrl: true,
        nativeSymbol: true,
        dropFactory: true,
        feeToken: true,
        treasury: true,
        operatorRegistry: true,
        zkFactory: true,
        deployBlock: true,
      },
    });
    return nets.filter((n): n is PublicNetwork => n.publicRpcUrl !== null);
  } catch {
    return [];
  }
}
