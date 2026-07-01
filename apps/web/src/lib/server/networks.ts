import { prisma } from "@/lib/db";
import type { PublicNetwork } from "@/lib/networkTypes";

/**
 * Enabled networks, sanitized for the browser (server rpcUrl stripped). Returns
 * [] when the DB is unavailable so the app falls back to the env fork chain.
 */
export async function getPublicNetworks(): Promise<PublicNetwork[]> {
  try {
    const nets = await prisma.network.findMany({
      where: { enabled: true },
      orderBy: { name: "asc" },
    });
    return nets.map((n) => ({
      chainId: n.chainId,
      name: n.name,
      publicRpcUrl: n.publicRpcUrl,
      explorerUrl: n.explorerUrl,
      nativeSymbol: n.nativeSymbol,
      dropFactory: n.dropFactory,
      feeToken: n.feeToken,
      treasury: n.treasury,
      operatorRegistry: n.operatorRegistry,
      zkFactory: n.zkFactory,
      deployBlock: n.deployBlock,
    }));
  } catch {
    return [];
  }
}
