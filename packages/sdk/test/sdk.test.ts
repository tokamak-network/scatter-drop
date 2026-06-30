import { describe, expect, it } from "vitest";
import { decodeFunctionData, getAddress, type Address } from "viem";
import {
  AirdropType,
  TokenTier,
  NATIVE_FEE_TOKEN,
  airdropTypeLabel,
  buildAddAllowedTokenRequest,
  buildApproveRequest,
  buildClaimRequest,
  buildCreateDropRequest,
  buildRemoveAllowedTokenRequest,
  buildSetFeeRequest,
  buildSetOfficialTokenRequest,
  buildWithdrawFeesRequest,
  dropFactoryAbi,
  encodeClaim,
  erc20Abi,
  getZkX509,
  isClaimWindowOpen,
  isVerificationValid,
  merkleDropAbi,
  parseDeployment,
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

describe("factory / erc20 calldata builders", () => {
  it("buildCreateDropRequest encodes createDrop v2 args (ERC-20 fee, value 0)", () => {
    const req = buildCreateDropRequest(A(7), {
      airdropType: AirdropType.CSV,
      airdropToken: A(2),
      merkleRoot: `0x${"ab".repeat(32)}`,
      totalAmount: 1000n,
      startTime: 1_800_000_000n,
      deadline: 1_900_000_000n,
      identityRegistry: A(3),
      feeToken: A(9),
      fee: 5n,
    });
    expect(req.to).toBe(A(7));
    expect(req.value).toBe(0n);
    const d = decodeFunctionData({ abi: dropFactoryAbi, data: req.data });
    expect(d.functionName).toBe("createDrop");
    expect(d.args[0]).toBe(AirdropType.CSV);
    expect(d.args[1]).toBe(A(2));
    expect(d.args[3]).toBe(1000n);
    expect(d.args[6]).toBe(A(3));
    expect(d.args[7]).toBe(A(9));
  });

  it("buildCreateDropRequest sends the fee as value when paid in ETH", () => {
    const req = buildCreateDropRequest(A(7), {
      airdropType: AirdropType.CSV,
      airdropToken: A(2),
      merkleRoot: `0x${"ab".repeat(32)}`,
      totalAmount: 1000n,
      startTime: 1_800_000_000n,
      deadline: 1_900_000_000n,
      identityRegistry: A(3),
      feeToken: NATIVE_FEE_TOKEN,
      fee: 777n,
    });
    expect(req.value).toBe(777n);
    const d = decodeFunctionData({ abi: dropFactoryAbi, data: req.data });
    expect(d.args[7]).toBe(NATIVE_FEE_TOKEN);
  });

  it("buildSetFeeRequest encodes (feeToken, type, amount)", () => {
    const d = decodeFunctionData({
      abi: dropFactoryAbi,
      data: buildSetFeeRequest(A(7), A(9), AirdropType.SOCIAL, 42n).data,
    });
    expect(d.functionName).toBe("setFee");
    expect(d.args).toEqual([A(9), AirdropType.SOCIAL, 42n]);
  });

  it("buildWithdrawFeesRequest encodes token + amount", () => {
    const req = buildWithdrawFeesRequest(A(7), A(2), 50n);
    const d = decodeFunctionData({ abi: dropFactoryAbi, data: req.data });
    expect(d.functionName).toBe("withdrawFees");
    expect(d.args).toEqual([A(2), 50n]);
  });

  it("buildApproveRequest targets the token with approve calldata", () => {
    const req = buildApproveRequest(A(2), A(7), 1000n);
    expect(req.to).toBe(A(2));
    const d = decodeFunctionData({ abi: erc20Abi, data: req.data });
    expect(d.functionName).toBe("approve");
    expect(d.args).toEqual([A(7), 1000n]);
  });
});

describe("events", () => {
  it("dropFactoryAbi includes the DropCreated event for log indexing", () => {
    const ev = dropFactoryAbi.find((e) => e.type === "event" && e.name === "DropCreated");
    expect(ev).toBeDefined();
    const names = ev?.inputs.map((i) => i.name) ?? [];
    expect(names).toContain("drop");
    expect(names).toContain("airdropToken");
    expect(names).toContain("merkleRoot");
  });
});

describe("token registry builders", () => {
  it("buildAddAllowedTokenRequest encodes addAllowedToken", () => {
    const req = buildAddAllowedTokenRequest(A(7), A(2));
    expect(req.to).toBe(A(7));
    const d = decodeFunctionData({ abi: dropFactoryAbi, data: req.data });
    expect(d.functionName).toBe("addAllowedToken");
    expect(d.args).toEqual([A(2)]);
  });

  it("buildSetOfficialTokenRequest encodes token + flag", () => {
    const d = decodeFunctionData({
      abi: dropFactoryAbi,
      data: buildSetOfficialTokenRequest(A(7), A(2), true).data,
    });
    expect(d.functionName).toBe("setOfficialToken");
    expect(d.args).toEqual([A(2), true]);
  });

  it("buildRemoveAllowedTokenRequest encodes removeAllowedToken", () => {
    const d = decodeFunctionData({
      abi: dropFactoryAbi,
      data: buildRemoveAllowedTokenRequest(A(7), A(2)).data,
    });
    expect(d.functionName).toBe("removeAllowedToken");
    expect(d.args).toEqual([A(2)]);
  });

  it("TokenTier ordinals match the on-chain enum", () => {
    expect(TokenTier.NONE).toBe(0);
    expect(TokenTier.COMMUNITY).toBe(1);
    expect(TokenTier.OFFICIAL).toBe(2);
  });
});

describe("addresses", () => {
  it("knows zk-X509 Sepolia addresses", () => {
    const z = getZkX509(11155111)!;
    expect(z.registryFactory).toBe("0x9e937dF6ac0E85979622519068412A518fa085d9");
    expect(z.usersRegistry).toBe("0x3cF6A96f1970053ffDf957074F988aD53D13ada3");
  });

  it("returns undefined for unknown chains", () => {
    expect(getZkX509(999)).toBeUndefined();
  });

  it("parseDeployment checksums and validates", () => {
    const d = parseDeployment({ chainId: 31337, dropFactory: A(5).toLowerCase() });
    expect(d.dropFactory).toBe(A(5));
    expect(() => parseDeployment({ chainId: 1 })).toThrow(/dropFactory/);
  });
});
