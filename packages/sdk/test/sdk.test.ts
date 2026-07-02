import { describe, expect, it } from "vitest";
import { decodeFunctionData, encodeAbiParameters, getAddress, type Address } from "viem";
import {
  AirdropType,
  TokenTier,
  FeeMode,
  NATIVE_FEE_TOKEN,
  NATIVE_ETH,
  airdropTypeLabel,
  buildApproveRequest,
  buildApproveAndCallRequest,
  buildClaimRequest,
  buildCreateDropRequest,
  buildCreateDropOneTxRequest,
  buildSetApproveAndCallSupportRequest,
  encodeOnApproveData,
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

  it("buildCreateDropRequest rejects address(0) as the airdrop token", () => {
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
    ).toThrow(/address\(0\)/);
  });

  it("buildCreateDropRequest funds a native ETH drop via msg.value (total + fee)", () => {
    const req = buildCreateDropRequest(A(7), {
      airdropType: AirdropType.CSV,
      airdropToken: NATIVE_ETH,
      merkleRoot: `0x${"ab".repeat(32)}`,
      totalAmount: 1000n,
      startTime: 1_800_000_000n,
      deadline: 1_900_000_000n,
      identityRegistry: NATIVE_FEE_TOKEN, // open claim
      fee: 5n,
    });
    expect(req.value).toBe(1005n);
    const d = decodeFunctionData({ abi: dropFactoryAbi, data: req.data });
    expect(getAddress(d.args[1] as Address)).toBe(NATIVE_ETH);
  });

  it("buildCreateDropRequest requires fee for a native ETH drop (fail fast)", () => {
    expect(() =>
      buildCreateDropRequest(A(7), {
        airdropType: AirdropType.CSV,
        airdropToken: NATIVE_ETH,
        merkleRoot: `0x${"ab".repeat(32)}`,
        totalAmount: 1000n,
        startTime: 1_800_000_000n,
        deadline: 1_900_000_000n,
        identityRegistry: NATIVE_FEE_TOKEN,
        // fee omitted
      }),
    ).toThrow(/require `fee`/);
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

  it("buildSetFeeBpsRequest rejects out-of-range bps", () => {
    expect(() => buildSetFeeBpsRequest(A(7), A(9), 1001)).toThrow(/\[0, 1000\]/);
    expect(() => buildSetFeeBpsRequest(A(7), A(9), -1)).toThrow();
    // boundary OK
    expect(buildSetFeeBpsRequest(A(7), A(9), 1000).data).toBeDefined();
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

describe("onApprove one-tx create (TON / approveAndCall)", () => {
  const params = {
    airdropType: AirdropType.CSV,
    airdropToken: A(0x707), // a TON-like ERC-20
    merkleRoot: `0x${"11".repeat(32)}` as const,
    totalAmount: 1_000n * 10n ** 18n,
    startTime: 1_000_000n,
    deadline: 1_604_800n,
    identityRegistry: NATIVE_FEE_TOKEN, // address(0) = open claim
  };
  const fee = 5n * 10n ** 18n;

  it("buildCreateDropOneTxRequest targets the token's approveAndCall(factory, total+fee, data)", () => {
    const req = buildCreateDropOneTxRequest(A(9), params, fee);
    expect(req.to).toBe(A(0x707)); // the token, not the factory
    const { functionName, args } = decodeFunctionData({
      abi: [
        {
          type: "function",
          name: "approveAndCall",
          stateMutability: "nonpayable",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "data", type: "bytes" },
          ],
          outputs: [{ type: "bool" }],
        },
      ] as const,
      data: req.data,
    });
    expect(functionName).toBe("approveAndCall");
    expect(args[0]).toBe(A(9)); // spender == factory
    expect(args[1]).toBe(params.totalAmount + fee); // amount == total + fee (onApprove's check)
    expect(args[2]).toBe(encodeOnApproveData(params)); // data == the DropParams blob
  });

  it("rejects native ETH (no approveAndCall)", () => {
    expect(() =>
      buildCreateDropOneTxRequest(A(9), { ...params, airdropToken: NATIVE_ETH }, fee),
    ).toThrow(/ERC-20|native/);
  });

  it("buildApproveAndCallRequest checksums token + spender", () => {
    const data = encodeOnApproveData(params);
    const req = buildApproveAndCallRequest(A(0x707).toLowerCase() as Address, A(9), 42n, data);
    expect(req.to).toBe(A(0x707));
  });

  it("encodeOnApproveData matches the DropParams ABI surface (encodeDropParams)", () => {
    // `encodeDropParams`'s tuple input IS the Solidity DropParams struct, and
    // abi-drift.test.ts pins that tuple to the Foundry artifact. Encoding via it and
    // comparing to encodeOnApproveData ties the SDK layout to the contract struct —
    // a struct reorder fails both abi-drift and this test.
    const enc = dropFactoryAbi.find(
      (e) => e.type === "function" && e.name === "encodeDropParams",
    ) as { inputs: readonly { components: readonly { name: string; type: string }[] }[] };
    const components = enc.inputs[0]!.components;
    const viaAbi = encodeAbiParameters([{ type: "tuple", components }], [
      {
        airdropType: params.airdropType,
        merkleRoot: params.merkleRoot,
        totalAmount: params.totalAmount,
        startTime: params.startTime,
        deadline: params.deadline,
        identityRegistry: params.identityRegistry,
      },
    ]);
    expect(encodeOnApproveData(params)).toBe(viaAbi);
  });

  it("buildSetApproveAndCallSupportRequest encodes the admin setter", () => {
    const req = buildSetApproveAndCallSupportRequest(A(9), A(0x707), true);
    expect(req.to).toBe(A(9));
    const { functionName, args } = decodeFunctionData({ abi: dropFactoryAbi, data: req.data });
    expect(functionName).toBe("setApproveAndCallSupport");
    expect(args).toEqual([A(0x707), true]);
  });
});
