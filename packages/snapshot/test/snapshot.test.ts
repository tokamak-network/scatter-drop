import { describe, expect, it, vi } from "vitest";
import { getAddress, type Address } from "viem";
import { allocate, totalOf } from "../src/allocate.js";
import { scanHolders } from "../src/scan.js";
import { buildSnapshotDrop } from "../src/index.js";
import type { Holder } from "../src/types.js";

const A = (n: number): Address => getAddress(`0x${n.toString(16).padStart(40, "0")}`);

const holders: Holder[] = [
  { address: A(1), balance: 100n },
  { address: A(2), balance: 300n },
  { address: A(3), balance: 600n },
];

describe("allocate — equal", () => {
  it("gives everyone perWallet", () => {
    const out = allocate(holders, { kind: "equal", perWallet: 50n });
    expect(out.map((e) => e.amount)).toEqual([50n, 50n, 50n]);
    expect(totalOf(out)).toBe(150n);
  });
  it("rejects non-positive perWallet", () => {
    expect(() => allocate(holders, { kind: "equal", perWallet: 0n })).toThrow(/> 0/);
  });
});

describe("allocate — proRata", () => {
  it("splits totalAmount by balance share (floor), never over-funds", () => {
    const out = allocate(holders, { kind: "proRata", totalAmount: 1000n });
    // shares: 100/1000, 300/1000, 600/1000 → 100, 300, 600
    expect(out.map((e) => e.amount)).toEqual([100n, 300n, 600n]);
    expect(totalOf(out)).toBe(1000n);
  });
  it("floors and leaves dust undistributed (sum <= totalAmount)", () => {
    const h: Holder[] = [
      { address: A(1), balance: 1n },
      { address: A(2), balance: 1n },
      { address: A(3), balance: 1n },
    ];
    const out = allocate(h, { kind: "proRata", totalAmount: 10n });
    // 10*1/3 = 3 each → total 9, dust 1 left
    expect(out.map((e) => e.amount)).toEqual([3n, 3n, 3n]);
    expect(totalOf(out)).toBe(9n);
    expect(totalOf(out)).toBeLessThanOrEqual(10n);
  });
  it("drops zero-amount recipients", () => {
    const h: Holder[] = [
      { address: A(1), balance: 1n },
      { address: A(2), balance: 1_000_000n },
    ];
    const out = allocate(h, { kind: "proRata", totalAmount: 100n });
    // tiny holder: 100*1/1000001 = 0 → dropped
    expect(out).toHaveLength(1);
    expect(out[0]!.account).toBe(A(2));
  });
  it("rejects zero total balance / zero totalAmount", () => {
    expect(() => allocate([{ address: A(1), balance: 0n }], { kind: "proRata", totalAmount: 100n })).toThrow(
      /zero/,
    );
    expect(() => allocate(holders, { kind: "proRata", totalAmount: 0n })).toThrow(/> 0/);
  });
});

// Minimal mock PublicClient: getLogs returns transfer `to`s (optionally with a
// per-transfer ERC-1155 `id`), multicall returns balances keyed by the first arg
// (the holder address) — so it serves ERC-20 `balanceOf(addr)` and ERC-1155
// `balanceOf(addr, id)` alike.
function mockClient(
  transfersTo: Address[],
  balances: Record<string, bigint>,
  logIds?: bigint[],
) {
  return {
    getLogs: vi.fn(async () =>
      transfersTo.map((to, i) => ({
        args: { from: A(0), to, value: 1n, ...(logIds ? { id: logIds[i] } : {}) },
      })),
    ),
    multicall: vi.fn(async ({ contracts }: { contracts: { args: readonly [Address, ...unknown[]] }[] }) =>
      contracts.map((c) => ({
        status: "success" as const,
        result: balances[c.args[0].toLowerCase()] ?? 0n,
      })),
    ),
  } as never;
}

describe("scanHolders", () => {
  it("collects Transfer recipients and filters by minBalance at the block", async () => {
    const client = mockClient([A(1), A(2), A(3)], {
      [A(1).toLowerCase()]: 50n,
      [A(2).toLowerCase()]: 500n,
      [A(3).toLowerCase()]: 0n, // transferred away by snapshot block
    });
    const out = await scanHolders(client, { token: A(9), block: 100n, minBalance: 100n });
    expect(out).toEqual([{ address: A(2), balance: 500n }]);
  });

  it("dedupes repeated recipients", async () => {
    const client = mockClient([A(1), A(1), A(1)], { [A(1).toLowerCase()]: 200n });
    const out = await scanHolders(client, { token: A(9), block: 10n, minBalance: 0n });
    expect(out).toHaveLength(1);
    expect(out[0]!.balance).toBe(200n);
  });
});

describe("scanHolders — ERC-721", () => {
  it("uses balanceOf(addr) as the NFT count and filters by minBalance (min count)", async () => {
    const client = mockClient([A(1), A(2), A(3)], {
      [A(1).toLowerCase()]: 1n, // below minCount
      [A(2).toLowerCase()]: 3n,
      [A(3).toLowerCase()]: 0n, // sold everything by the snapshot block
    });
    const out = await scanHolders(client, {
      token: A(9),
      block: 100n,
      minBalance: 2n,
      kind: "erc721",
    });
    expect(out).toEqual([{ address: A(2), balance: 3n }]);
  });
});

describe("scanHolders — ERC-1155", () => {
  it("reads balanceOf(addr, tokenId) and filters by min count", async () => {
    const client = mockClient(
      [A(1), A(2)],
      { [A(1).toLowerCase()]: 5n, [A(2).toLowerCase()]: 1n /* below minCount */ },
      [7n, 7n], // both received the target id
    );
    const out = await scanHolders(client, {
      token: A(9),
      block: 50n,
      minBalance: 2n,
      kind: "erc1155",
      tokenId: 7n,
    });
    expect(out).toEqual([{ address: A(1), balance: 5n }]);
  });

  it("excludes candidates who only received other ids (filters by id in the log scan)", async () => {
    const client = mockClient(
      [A(1), A(2)],
      { [A(1).toLowerCase()]: 5n, [A(2).toLowerCase()]: 9n }, // A(2) holds plenty…
      [7n, 99n], // …but only ever received id 99, not the target 7
    );
    const out = await scanHolders(client, {
      token: A(9),
      block: 50n,
      minBalance: 1n,
      kind: "erc1155",
      tokenId: 7n,
    });
    expect(out).toEqual([{ address: A(1), balance: 5n }]);
  });

  it("requires a tokenId", async () => {
    const client = mockClient([A(1)], { [A(1).toLowerCase()]: 1n });
    await expect(
      scanHolders(client, { token: A(9), block: 50n, minBalance: 1n, kind: "erc1155" }),
    ).rejects.toThrow(/tokenId/);
  });
});

describe("allocate — NFT count weighting", () => {
  it("proRata weights by NFT count (Holder.balance)", () => {
    const nftHolders: Holder[] = [
      { address: A(1), balance: 1n },
      { address: A(2), balance: 3n },
    ];
    const out = allocate(nftHolders, { kind: "proRata", totalAmount: 400n });
    // shares: 1/4, 3/4 → 100, 300
    expect(out.map((e) => e.amount)).toEqual([100n, 300n]);
    expect(totalOf(out)).toBe(400n);
  });
});

describe("buildSnapshotDrop (end-to-end)", () => {
  it("scan → allocate → merkle, proofs verify", async () => {
    const client = mockClient([A(1), A(2)], {
      [A(1).toLowerCase()]: 100n,
      [A(2).toLowerCase()]: 300n,
    });
    const res = await buildSnapshotDrop(
      client,
      { token: A(9), block: 50n, minBalance: 1n },
      { kind: "proRata", totalAmount: 400n },
    );
    expect(res.holderCount).toBe(2);
    expect(res.count).toBe(2);
    expect(res.totalAmount).toBe("400"); // 100 + 300
    expect(Object.keys(res.claims)).toHaveLength(2);
  });

  it("throws when no holders match", async () => {
    const client = mockClient([A(1)], { [A(1).toLowerCase()]: 1n });
    await expect(
      buildSnapshotDrop(client, { token: A(9), block: 50n, minBalance: 1000n }, { kind: "equal", perWallet: 1n }),
    ).rejects.toThrow(/no holders/);
  });
});
