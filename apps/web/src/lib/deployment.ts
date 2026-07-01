import { getAddress, type Address } from "viem";
import {
  parseDeployment,
  type ScatterDropDeployment,
} from "@tokamak-network/scatter-drop-sdk";

/**
 * Deployment plus the optional deploy block (for log scanning) and deployer
 * address (DropFactory owner — used as the admin gate; the ABI exposes no
 * owner() view, flagged to K0).
 */
export type WebDeployment = ScatterDropDeployment & {
  deployBlock?: bigint;
  deployer?: Address;
};

function toAddr(v: unknown): Address | undefined {
  if (typeof v !== "string") return undefined;
  try {
    return getAddress(v);
  } catch {
    return undefined;
  }
}

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
    return {
      ...base,
      deployBlock: toBlock(process.env.NEXT_PUBLIC_DEPLOY_BLOCK),
      deployer: toAddr(process.env.NEXT_PUBLIC_DEPLOYER),
    };
  } catch {
    return null;
  }
}

export async function fetchDeployment(): Promise<WebDeployment | null> {
  // Build-time env is the primary source (per the precedence above) and needs
  // no network round-trip. Only the dev fork drops a runtime deployment.json,
  // so probe for it only when env is unset — otherwise a fixed deploy would
  // 404 on `/deployment.json` every load.
  const env = getEnvDeployment();
  if (env) return env;
  try {
    const res = await fetch("/deployment.json", { cache: "no-store" });
    if (!res.ok) return null;
    const raw = await res.json();
    return {
      ...parseDeployment(raw),
      deployBlock: toBlock(raw?.deployBlock),
      deployer: toAddr(raw?.deployer),
    };
  } catch {
    return null;
  }
}
