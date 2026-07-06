import { describe, expect, it } from "vitest";
import { getAddress, type Address } from "viem";
import { buildDrop, normalizeEntries } from "../src/drop.js";
import { verifyClaim } from "../src/index.js";
import { parseCsv } from "../src/csv.js";
import { buildTree, getProof, leafHash, verifyProof } from "../src/merkle.js";
import type { AirdropEntry } from "../src/types.js";

const A = (n: number): Address =>
  getAddress(`0x${n.toString(16).padStart(40, "0")}`);

const sample: AirdropEntry[] = [
  { account: A(3), amount: 300n },
  { account: A(1), amount: 100n },
  { account: A(2), amount: 200n },
];

describe("normalizeEntries", () => {
  it("sorts by address and assigns stable indices", () => {
    const out = normalizeEntries(sample);
    expect(out.map((e) => e.account)).toEqual([A(1), A(2), A(3)]);
    expect(out.map((e) => e.index)).toEqual([0, 1, 2]);
  });

  it("is order-independent (deterministic root)", () => {
    const shuffled = [...sample].reverse();
    expect(buildDrop(sample).merkleRoot).toBe(buildDrop(shuffled).merkleRoot);
  });

  it("rejects duplicates", () => {
    expect(() => normalizeEntries([...sample, { account: A(1), amount: 1n }])).toThrow(
      /Duplicate/,
    );
  });

  it("rejects non-positive amounts", () => {
    expect(() => normalizeEntries([{ account: A(1), amount: 0n }])).toThrow(/> 0/);
  });

  it("rejects empty list", () => {
    expect(() => normalizeEntries([])).toThrow(/empty/);
  });
});

describe("buildDrop", () => {
  it("computes totalAmount and per-account proofs", () => {
    const drop = buildDrop(sample);
    expect(drop.totalAmount).toBe("600");
    expect(drop.count).toBe(3);
    expect(Object.keys(drop.claims)).toHaveLength(3);
  });

  it("every claim verifies against the root", () => {
    const drop = buildDrop(sample);
    for (const claim of Object.values(drop.claims)) {
      expect(verifyClaim(drop.merkleRoot, claim)).toBe(true);
    }
  });

  it("a tampered amount fails verification", () => {
    const drop = buildDrop(sample);
    const claim = drop.claims[A(1)]!;
    expect(verifyClaim(drop.merkleRoot, { ...claim, amount: "999" })).toBe(false);
  });

  it("single-recipient tree: root equals the only leaf, empty proof", () => {
    const drop = buildDrop([{ account: A(1), amount: 42n }]);
    const claim = drop.claims[A(1)]!;
    expect(claim.proof).toHaveLength(0);
    expect(verifyClaim(drop.merkleRoot, claim)).toBe(true);
  });
});

describe("merkle primitives", () => {
  it("odd-leaf tree promotes the last node and proofs still verify", () => {
    const indexed = normalizeEntries([
      { account: A(1), amount: 1n },
      { account: A(2), amount: 2n },
      { account: A(3), amount: 3n },
    ]);
    const leaves = indexed.map(leafHash);
    const tree = buildTree(leaves);
    leaves.forEach((leaf, i) => {
      expect(verifyProof(tree.root, leaf, getProof(tree, i))).toBe(true);
    });
  });

  it("scales to many recipients", () => {
    const entries = Array.from({ length: 5000 }, (_, i) => ({
      account: A(i + 1),
      amount: BigInt(i + 1),
    }));
    const drop = buildDrop(entries);
    const some = drop.claims[A(1234)]!;
    expect(verifyClaim(drop.merkleRoot, some)).toBe(true);
  });
});

describe("parseCsv", () => {
  it("parses rows, header, comments, and blanks", () => {
    const csv = [
      "address,amount",
      `${A(1)},100`,
      "# a comment",
      "",
      `${A(2)}, 200 `,
    ].join("\n");
    const entries = parseCsv(csv);
    expect(entries).toEqual([
      { account: A(1), amount: 100n },
      { account: A(2), amount: 200n },
    ]);
  });

  it("strips a leading UTF-8 BOM", () => {
    const csv = `﻿address,amount\n${A(1)},100`;
    expect(parseCsv(csv)).toEqual([{ account: A(1), amount: 100n }]);
  });

  it("skips a header that appears after blank/comment lines", () => {
    const csv = ["# recipients", "", "address,amount", `${A(1)},100`].join("\n");
    expect(parseCsv(csv)).toEqual([{ account: A(1), amount: 100n }]);
  });

  it("rejects bad address and non-integer amount", () => {
    expect(() => parseCsv("0xnotanaddress,100")).toThrow(/invalid address/);
    expect(() => parseCsv(`${A(1)},1.5`)).toThrow(/base-unit integer/);
  });

  it("scales human token amounts by decimals when opted in", () => {
    const csv = [`${A(1)},1000`, `${A(2)},1.5`].join("\n");
    expect(parseCsv(csv, { decimals: 18 })).toEqual([
      { account: A(1), amount: 1000n * 10n ** 18n },
      { account: A(2), amount: 15n * 10n ** 17n },
    ]);
    // 6-decimal token (USDC-like)
    expect(parseCsv(`${A(1)},2.25`, { decimals: 6 })).toEqual([
      { account: A(1), amount: 2_250_000n },
    ]);
  });

  it("rejects amounts with more fraction digits than the token's decimals", () => {
    expect(() => parseCsv(`${A(1)},1.1234567`, { decimals: 6 })).toThrow(
      /more than 6 decimal places/,
    );
    expect(() => parseCsv(`${A(1)},abc`, { decimals: 18 })).toThrow(/token amount/);
  });
});
