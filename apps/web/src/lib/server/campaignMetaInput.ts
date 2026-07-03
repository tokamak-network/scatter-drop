import { isChainId, LOWER_ADDR_RE } from "./apiInput";

/**
 * Shared body parse/validation for /api/campaign-meta POST and PATCH — one
 * copy so the two handlers can't drift (they already had once: PATCH grew a
 * non-null body guard POST lacked).
 */

export const MAX_NAME = 80;
export const MAX_DESCRIPTION = 400;

export type CampaignMetaInput = {
  chainId: number;
  drop: string;
  name: string;
  description: string;
  txHash?: unknown;
};

/** Validate + normalize a campaign-meta payload. Returns {error} on failure. */
export function parseCampaignMeta(
  body: unknown,
): { value: CampaignMetaInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Invalid JSON body" };
  }
  const b = body as {
    chainId?: unknown;
    drop?: unknown;
    name?: unknown;
    description?: unknown;
    txHash?: unknown;
  };
  const chainId = isChainId(b.chainId) ? b.chainId : null;
  const drop = typeof b.drop === "string" ? b.drop.toLowerCase() : null;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (!chainId) return { error: "Invalid chainId" };
  if (!drop || !LOWER_ADDR_RE.test(drop)) return { error: "Invalid drop address" };
  if (!name || name.length > MAX_NAME) {
    return { error: `name required (max ${MAX_NAME} chars)` };
  }
  if (description.length > MAX_DESCRIPTION) {
    return { error: `description too long (max ${MAX_DESCRIPTION} chars)` };
  }
  return { value: { chainId, drop, name, description, txHash: b.txHash } };
}
