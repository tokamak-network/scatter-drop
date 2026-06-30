import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  dropFactoryAbi,
  identityRegistryAbi,
  merkleDropAbi,
  registryFactoryAbi,
} from "../src/core/abis.js";

/**
 * ABI drift guard.
 *
 * The SDK ships a curated, minimal subset of each contract's ABI (see
 * `src/core/abis.ts`). This test asserts that every entry the SDK declares still
 * matches the canonical Foundry artifact byte-for-byte at the signature level, so
 * a contract change that renames/retypes a function, event, or error is caught
 * instead of silently breaking SDK consumers.
 *
 * It only checks that the SDK's declared subset is a subset of the canonical ABI;
 * the contract legitimately exposes more than the SDK curates, so canonical-only
 * entries are not failures.
 *
 * Requires the Foundry artifacts to exist — run `forge build` (or
 * `pnpm contracts:build`) first. If `contracts/out` is absent the test is skipped
 * with a warning rather than failing, so `pnpm test` still runs without Foundry.
 */

type AbiParam = {
  type: string;
  indexed?: boolean;
  components?: AbiParam[];
};

type AbiItem = {
  type: string;
  name?: string;
  stateMutability?: string;
  inputs?: AbiParam[];
  outputs?: AbiParam[];
};

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../contracts/out");

/**
 * Fully-expanded parameter type. Recurses into tuple `components` so that a
 * struct's field rename/reorder/retype is reflected in the signature instead of
 * collapsing to a bare `tuple` / `tuple[]`.
 */
function paramType(p: AbiParam): string {
  if (p.type.startsWith("tuple") && p.components) {
    return `(${p.components.map(paramType).join(",")})${p.type.slice("tuple".length)}`;
  }
  return p.type;
}

/** Stable signature key for an ABI item, comparable across sources. */
function sigKey(item: AbiItem): string {
  const ins = (item.inputs ?? [])
    .map((i) => (i.indexed ? `${paramType(i)} indexed` : paramType(i)))
    .join(",");
  switch (item.type) {
    case "function": {
      const outs = (item.outputs ?? []).map(paramType).join(",");
      return `fn ${item.name}(${ins})->(${outs}):${item.stateMutability}`;
    }
    case "event":
      return `ev ${item.name}(${ins})`;
    case "error":
      return `er ${item.name}(${ins})`;
    case "constructor":
      return `ctor(${ins})`;
    default:
      return `${item.type} ${item.name ?? ""}(${ins})`;
  }
}

function canonicalKeys(artifactRelPath: string): Set<string> {
  const json = JSON.parse(readFileSync(resolve(OUT_DIR, artifactRelPath), "utf8"));
  const keys = new Set<string>();
  for (const item of json.abi as AbiItem[]) keys.add(sigKey(item));
  return keys;
}

const PAIRS = [
  { name: "DropFactory", sdk: dropFactoryAbi, artifact: "DropFactory.sol/DropFactory.json" },
  { name: "MerkleDrop", sdk: merkleDropAbi, artifact: "MerkleDrop.sol/MerkleDrop.json" },
  {
    name: "IIdentityRegistry",
    sdk: identityRegistryAbi,
    artifact: "IIdentityRegistry.sol/IIdentityRegistry.json",
  },
  {
    name: "IRegistryFactoryLike",
    sdk: registryFactoryAbi,
    artifact: "IRegistryFactoryLike.sol/IRegistryFactoryLike.json",
  },
] as const;

const artifactsPresent = existsSync(OUT_DIR);

if (!artifactsPresent) {
  console.warn(`[abi-drift] ${OUT_DIR} not found — drift guard skipped. Run \`forge build\` to enable it.`);
}

describe.skipIf(!artifactsPresent)("SDK ABIs match the canonical Foundry artifacts", () => {
  for (const { name, sdk, artifact } of PAIRS) {
    it(`${name}: every SDK-declared entry exists in the canonical ABI`, () => {
      const canonical = canonicalKeys(artifact);
      // SDK ABIs are `as const` (deeply readonly literal types); widen via `unknown`.
      const missing = (sdk as unknown as AbiItem[])
        .map(sigKey)
        .filter((key) => !canonical.has(key));

      expect(
        missing,
        `SDK \`${name}\` ABI has entries not present (with matching signature) in the canonical ` +
          `contract. Update packages/sdk/src/core/abis.ts to match contracts/out:\n  ${missing.join("\n  ")}`,
      ).toEqual([]);
    });
  }
});
