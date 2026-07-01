const ADDR = /^0x[0-9a-fA-F]{40}$/;

export interface NetworkInput {
  chainId: number;
  name: string;
  rpcUrl: string;
  publicRpcUrl: string | null;
  explorerUrl: string | null;
  nativeSymbol: string;
  dropFactory: string;
  feeToken: string | null;
  treasury: string | null;
  operatorRegistry: string | null;
  zkFactory: string | null;
  deployBlock: number | null;
  enabled: boolean;
}

/** Validate + normalize an admin network payload. Returns {error} on failure. */
export function parseNetwork(body: unknown): NetworkInput | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const chainId = Number(b.chainId);
  if (!Number.isInteger(chainId) || chainId <= 0) return { error: "chainId must be a positive integer" };
  if (typeof b.name !== "string" || !b.name.trim()) return { error: "name is required" };
  if (typeof b.rpcUrl !== "string" || !/^https?:\/\//.test(b.rpcUrl)) return { error: "rpcUrl must be an http(s) URL" };
  if (typeof b.dropFactory !== "string" || !ADDR.test(b.dropFactory)) return { error: "dropFactory must be an address" };

  const optAddr = (v: unknown, f: string): string | null => {
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string" || !ADDR.test(v)) throw new Error(`${f} must be an address`);
    return v;
  };
  const optStr = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

  try {
    return {
      chainId,
      name: b.name.trim(),
      rpcUrl: b.rpcUrl,
      publicRpcUrl: optStr(b.publicRpcUrl),
      explorerUrl: optStr(b.explorerUrl),
      nativeSymbol: typeof b.nativeSymbol === "string" && b.nativeSymbol ? b.nativeSymbol : "ETH",
      dropFactory: b.dropFactory,
      feeToken: optAddr(b.feeToken, "feeToken"),
      treasury: optAddr(b.treasury, "treasury"),
      operatorRegistry: optAddr(b.operatorRegistry, "operatorRegistry"),
      zkFactory: optAddr(b.zkFactory, "zkFactory"),
      deployBlock:
        b.deployBlock != null && Number.isInteger(Number(b.deployBlock)) ? Number(b.deployBlock) : null,
      enabled: b.enabled === undefined ? true : !!b.enabled,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "invalid input" };
  }
}
