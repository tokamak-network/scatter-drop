import { getAddress, type Address } from "viem";

/**
 * zk-X509 contracts that scatter-drop integrates with, per chain.
 * Sourced from the zk-X509 deployment ledger (e.g. Sepolia 11155111).
 */
export interface ZkX509Addresses {
  /** RegistryFactory — `isRegistry()` validates customer/operator registries. */
  registryFactory: Address;
  /** Default user IdentityRegistry (gates deposits/claims). */
  usersRegistry: Address;
  /** Relayer IdentityRegistry (alternative operator gate). */
  relayersRegistry?: Address;
}

/**
 * scatter-drop's own deployment on a chain (produced by the deploy script as
 * `deployments/<chainId>.json`). Consumed by the SDK/frontend to locate the factory.
 */
export interface ScatterDropDeployment {
  chainId: number;
  dropFactory: Address;
  feeToken?: Address;
  treasury?: Address;
}

/** Known zk-X509 deployments keyed by chainId. */
export const ZK_X509: Record<number, ZkX509Addresses> = {
  // Sepolia
  11155111: {
    registryFactory: getAddress("0x9e937dF6ac0E85979622519068412A518fa085d9"),
    usersRegistry: getAddress("0x3cF6A96f1970053ffDf957074F988aD53D13ada3"),
    relayersRegistry: getAddress("0x9fDE6182B1fd10F2eDfE15b704FE95787C170914"),
  },
};

/** Look up zk-X509 addresses for a chain, or undefined if unknown. */
export function getZkX509(chainId: number): ZkX509Addresses | undefined {
  return ZK_X509[chainId];
}

/**
 * Normalize a raw `deployments/<chainId>.json` object into a typed
 * ScatterDropDeployment (checksums addresses). Throws if required fields are missing.
 */
export function parseDeployment(raw: unknown): ScatterDropDeployment {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("deployment: expected a JSON object");
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.chainId !== "number") throw new Error("deployment: missing numeric chainId");
  if (typeof o?.dropFactory !== "string") throw new Error("deployment: missing dropFactory address");
  return {
    chainId: o.chainId,
    dropFactory: getAddress(o.dropFactory as string),
    feeToken: typeof o.feeToken === "string" ? getAddress(o.feeToken) : undefined,
    treasury: typeof o.treasury === "string" ? getAddress(o.treasury) : undefined,
  };
}
