import { parseDeployment, type ScatterDropDeployment } from "@tokamak-network/scatter-drop-sdk";

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
export function getEnvDeployment(): ScatterDropDeployment | null {
  const dropFactory = process.env.NEXT_PUBLIC_DROP_FACTORY;
  const chainId = process.env.NEXT_PUBLIC_CHAIN_ID;
  if (!dropFactory || !chainId) return null;
  try {
    return parseDeployment({
      chainId: Number(chainId),
      dropFactory,
      feeToken: process.env.NEXT_PUBLIC_FEE_TOKEN,
      treasury: process.env.NEXT_PUBLIC_TREASURY,
    });
  } catch {
    return null;
  }
}

export async function fetchDeployment(): Promise<ScatterDropDeployment | null> {
  try {
    const res = await fetch("/deployment.json", { cache: "no-store" });
    if (!res.ok) return getEnvDeployment();
    return parseDeployment(await res.json());
  } catch {
    return getEnvDeployment();
  }
}
