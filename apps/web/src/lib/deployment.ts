import { parseDeployment, type ScatterDropDeployment } from "@tokamak-network/scatter-drop-sdk";

/** Deployment plus the optional block it was deployed at (for log scanning). */
export type WebDeployment = ScatterDropDeployment & { deployBlock?: bigint };

/**
 * Resolves the active scatter-drop deployment (DropFactory + fee token + treasury).
 *
 * Two sources, in order:
 *  1. Build-time env (`NEXT_PUBLIC_DROP_FACTORY` etc.) — good for a fixed deploy.
 *  2. Runtime `public/deployment.json` — good for the dev fork, whose addresses
 *     change each run: `dev-fork.sh` writes `contracts/deployments/<id>.json`;
 *     copy it to `apps/web/public/deployment.json` (no rebuild needed).
 *
 * Returns null when nothing is configured so the UI can prompt the user to
 * start the fork instead of crashing.
 */
function toBlock(v: unknown): bigint | undefined {
  if (typeof v === "number" || typeof v === "string") {
    try {
      return BigInt(v);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function getEnvDeployment(): WebDeployment | null {
  const dropFactory = process.env.NEXT_PUBLIC_DROP_FACTORY;
  const chainId = process.env.NEXT_PUBLIC_CHAIN_ID;
  if (!dropFactory || !chainId) return null;
  try {
    const base = parseDeployment({
      chainId: Number(chainId),
      dropFactory,
      feeToken: process.env.NEXT_PUBLIC_FEE_TOKEN,
      treasury: process.env.NEXT_PUBLIC_TREASURY,
    });
    return { ...base, deployBlock: toBlock(process.env.NEXT_PUBLIC_DEPLOY_BLOCK) };
  } catch {
    return null;
  }
}

export async function fetchDeployment(): Promise<WebDeployment | null> {
  try {
    const res = await fetch("/deployment.json", { cache: "no-store" });
    if (!res.ok) return getEnvDeployment();
    const raw = await res.json();
    return { ...parseDeployment(raw), deployBlock: toBlock(raw?.deployBlock) };
  } catch {
    return getEnvDeployment();
  }
}
