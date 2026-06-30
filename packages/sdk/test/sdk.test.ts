import { describe, expect, it } from "vitest";
import { decodeFunctionData, getAddress, type Address } from "viem";
import {
  AirdropType,
  airdropTypeLabel,
  buildClaimRequest,
  encodeClaim,
  isClaimWindowOpen,
  isVerificationValid,
  merkleDropAbi,
} from "../src/index.js";
import { buildDrop } from "../src/merkle/index.js";

const A = (n: number): Address => getAddress(`0x${n.toString(16).padStart(40, "0")}`);

describe("types/util", () => {
  it("AirdropType ordinals match the on-chain enum", () => {
    expect(AirdropType.CSV).toBe(0);
    expect(AirdropType.ONCHAIN_SNAPSHOT).toBe(1);
    expect(AirdropType.ONCHAIN_GATED).toBe(2);
    expect(AirdropType.SOCIAL).toBe(3);
  });

  it("labels every type", () => {
    expect(airdropTypeLabel(AirdropType.CSV)).toMatch(/CSV/);
    expect(airdropTypeLabel(AirdropType.SOCIAL)).toMatch(/Social/);
  });

  it("claim window open iff now <= deadline", () => {
    expect(isClaimWindowOpen(100n, 100n)).toBe(true);
    expect(isClaimWindowOpen(100n, 101n)).toBe(false);
  });
});

describe("identity gate (pure)", () => {
  it("requires non-zero and not-expired", () => {
    expect(isVerificationValid(0n, 50n)).toBe(false);
    expect(isVerificationValid(100n, 50n)).toBe(true);
    expect(isVerificationValid(100n, 100n)).toBe(true);
    expect(isVerificationValid(100n, 101n)).toBe(false);
  });
});

describe("claim encoding", () => {
  it("encodeClaim round-trips through the MerkleDrop ABI", () => {
    const drop = buildDrop([
      { account: A(1), amount: 100n },
      { account: A(2), amount: 200n },
    ]);
    const claim = drop.claims[A(1)]!;
    const data = encodeClaim(claim);

    const decoded = decodeFunctionData({ abi: merkleDropAbi, data });
    expect(decoded.functionName).toBe("claim");
    expect(decoded.args[0]).toBe(BigInt(claim.index));
    expect(decoded.args[1]).toBe(A(1));
    expect(decoded.args[2]).toBe(100n);
    expect(decoded.args[3]).toEqual(claim.proof);
  });

  it("buildClaimRequest targets the drop with claim calldata", () => {
    const drop = buildDrop([{ account: A(1), amount: 100n }]);
    const req = buildClaimRequest(A(99), drop.claims[A(1)]!);
    expect(req.to).toBe(A(99));
    expect(req.data.startsWith("0x")).toBe(true);
  });
});
