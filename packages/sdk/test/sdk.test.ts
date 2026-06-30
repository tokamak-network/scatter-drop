import { describe, expect, it } from "vitest";
import { decodeFunctionData, getAddress, type Address } from "viem";
import {
  AirdropType,
  TokenTier,
  FeeMode,
  NATIVE_FEE_TOKEN,
  airdropTypeLabel,
  buildApproveRequest,
  buildClaimRequest,
  buildCreateDropRequest,
  buildSetAllowedTokenRequest,
  buildSetFeeBpsRequest,
  buildSetFlatFeeRequest,
  buildSetFeeModeRequest,
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

  it("claim window respects both start and deadline", () => {
    expect(isClaimWindowOpen(100n, 100n)).toBe(true);   // at deadline
    expect(isClaimWindowOpen(100n, 101n)).toBe(false);  // past deadline
    expect(isClaimWindowOpen(100n, 50n, 60n)).toBe(false); // before start
    expect(isClaimWindowOpen(100n, 60n, 60n)).toBe(true);  // at start
    expect(isClaimWindowOpen(100n, 80n, 60n)).toBe(true);  // inside window
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
  it("buildCreateDropRequest encodes the 7-arg createDrop (non-payable, value 0)", () => {
    const req = buildCreateDropRequest(A(7), {
      airdropType: AirdropType.CSV,
      airdropToken: A(2),
      merkleRoot: `0x${"ab".repeat(32)}`,
      totalAmount: 1000n,
      startTime: 1_800_000_000n,
      deadline: 1_900_000_000n,
      identityRegistry: A(3),
    });
    expect(req.to).toBe(A(7));
    expect(req.value ?? 0n).toBe(0n);
    const d = decodeFunctionData({ abi: dropFactoryAbi, data: req.data });
    expect(d.functionName).toBe("createDrop");
    expect(d.args[0]).toBe(AirdropType.CSV);
    expect(d.args[1]).toBe(A(2));
    expect(d.args[3]).toBe(1000n);
    expect(d.args[6]).toBe(A(3));
    expect(d.args).toHaveLength(7);
  });

  it("buildCreateDropRequest allows an open (zero) identity registry", () => {
    const req = buildCreateDropRequest(A(7), {
      airdropType: AirdropType.CSV,
      airdropToken: A(2),
      merkleRoot: `0x${"ab".repeat(32)}`,
      totalAmount: 1000n,
      startTime: 1_800_000_000n,
      deadline: 1_900_000_000n,
      identityRegistry: NATIVE_FEE_TOKEN, // address(0) = open claim
    });
    const d = decodeFunctionData({ abi: dropFactoryAbi, data: req.data });
    expect(d.args[6]).toBe(NATIVE_FEE_TOKEN);
  });

  it("buildCreateDropRequest rejects a native airdrop token", () => {
    expect(() =>
      buildCreateDropRequest(A(7), {
        airdropType: AirdropType.CSV,
        airdropToken: NATIVE_FEE_TOKEN,
        merkleRoot: `0x${"ab".repeat(32)}`,
        totalAmount: 1000n,
        startTime: 1_800_000_000n,
        deadline: 1_900_000_000n,
        identityRegistry: A(3),
      }),
    ).toThrow(/native token/);
  });

  it("fee builders encode per-token mode/rate setters", () => {
    const bps = decodeFunctionData({
      abi: dropFactoryAbi,
      data: buildSetFeeBpsRequest(A(7), A(9), 50).data,
    });
    expect(bps.functionName).toBe("setFeeBps");
    expect(bps.args).toEqual([A(9), 50]);

    const flat = decodeFunctionData({
      abi: dropFactoryAbi,
      data: buildSetFlatFeeRequest(A(7), A(9), 42n).data,
    });
    expect(flat.functionName).toBe("setFlatFee");
    expect(flat.args).toEqual([A(9), 42n]);

    const mode = decodeFunctionData({
      abi: dropFactoryAbi,
      data: buildSetFeeModeRequest(A(7), A(9), FeeMode.FLAT).data,
    });
    expect(mode.functionName).toBe("setFeeMode");
    expect(mode.args).toEqual([A(9), FeeMode.FLAT]);
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

describe("token allow-list builder", () => {
  it("buildSetAllowedTokenRequest encodes token + allowed flag", () => {
    const on = decodeFunctionData({
      abi: dropFactoryAbi,
      data: buildSetAllowedTokenRequest(A(7), A(2), true).data,
    });
    expect(on.functionName).toBe("setAllowedToken");
    expect(on.args).toEqual([A(2), true]);

    const off = decodeFunctionData({
      abi: dropFactoryAbi,
      data: buildSetAllowedTokenRequest(A(7), A(2), false).data,
    });
    expect(off.args).toEqual([A(2), false]);
  });

  it("TokenTier ordinals match the on-chain enum", () => {
    expect(TokenTier.NONE).toBe(0);
    expect(TokenTier.ALLOWED).toBe(1);
  });
});

describe("addresses", () => {
  it("knows zk-X509 Sepolia addresses", () => {
    const z = getZkX509(11155111)!;
    expect(z.registryFactory).toBe("0x9e937dF6ac0E85979622519068412A518fa085d9");
    expect(z.usersRegistry).toBe("0x3cF6A96f1970053ffDf957074F988aD53D13ada3");
  });

  it("resolves the local fork chainId 31337 to the Sepolia registries", () => {
    const z = getZkX509(31337)!;
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
