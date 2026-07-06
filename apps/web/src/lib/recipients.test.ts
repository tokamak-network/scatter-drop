import { describe, expect, it } from "vitest";
import {
  computeDistribution,
  csvToRows,
  dedupSum,
  duplicateCount,
  hasInvalidAddress,
  isqrt,
  rowsToCsv,
  toBaseUnits,
  withTrailingBlank,
  type Recipient,
} from "./recipients";

// Well-formed checksummed test addresses (anvil accounts).
const A = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const B = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const C = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const row = (address: string, amount: string): Recipient => ({ address, amount });

describe("isqrt", () => {
  it("floors the integer square root", () => {
    expect(isqrt(0n)).toBe(0n);
    expect(isqrt(1n)).toBe(1n);
    expect(isqrt(15n)).toBe(3n);
    expect(isqrt(16n)).toBe(4n);
    expect(isqrt(10n ** 36n)).toBe(10n ** 18n);
  });
  it("clamps negatives to 0", () => {
    expect(isqrt(-5n)).toBe(0n);
  });
});

describe("csvToRows / rowsToCsv", () => {
  it("parses comma and tab separated lines, trimming and unquoting", () => {
    const rows = csvToRows(`${A},100\n"${B}"\t"200"`);
    expect(rows).toEqual([row(A, "100"), row(B, "200")]);
  });
  it("strips a BOM, blank lines, '#' comments, and an 'address' header", () => {
    const rows = csvToRows(`﻿# note\naddress,amount\n\n${A},1\n`);
    expect(rows).toEqual([row(A, "1")]);
  });
  it("returns a single blank row for empty input", () => {
    expect(csvToRows("")).toEqual([{ address: "", amount: "" }]);
  });
  it("round-trips non-empty rows (drops trailing blank)", () => {
    const rows = [row(A, "1"), row(B, "2"), { address: "", amount: "" }];
    expect(rowsToCsv(rows)).toBe(`${A},1\n${B},2`);
  });
});

describe("withTrailingBlank", () => {
  it("appends a blank row when the last is filled", () => {
    expect(withTrailingBlank([row(A, "1")])).toEqual([row(A, "1"), { address: "", amount: "" }]);
  });
  it("leaves an already-blank tail untouched", () => {
    const rows = [row(A, "1"), { address: "", amount: "" }];
    expect(withTrailingBlank(rows)).toBe(rows);
  });
});

describe("dedupSum", () => {
  it("merges duplicate addresses (case-insensitive), summing balances, first-seen order/casing", () => {
    const out = dedupSum([row(A, "100"), row(B, "50"), row(A.toLowerCase(), "25")]);
    expect(out).toEqual([row(A, "125"), row(B, "50")]);
  });
  it("skips invalid addresses and treats non-integer amounts as 0", () => {
    expect(dedupSum([row("nope", "1"), row(A, "x")])).toEqual([row(A, "0")]);
  });
});

describe("hasInvalidAddress / duplicateCount", () => {
  it("hasInvalidAddress ignores blank rows, flags a bad one", () => {
    expect(hasInvalidAddress([row(A, "1"), { address: "", amount: "" }])).toBe(false);
    expect(hasInvalidAddress([row(A, "1"), row("0xnope", "2")])).toBe(true);
  });
  it("duplicateCount counts repeats case-insensitively, ignoring invalid rows", () => {
    expect(duplicateCount([row(A, "1"), row(B, "2")])).toBe(0);
    expect(duplicateCount([row(A, "1"), row(A.toLowerCase(), "2"), row(A, "3")])).toBe(2);
    expect(duplicateCount([row("bad", "1"), row("bad", "2")])).toBe(0);
  });
});

describe("toBaseUnits", () => {
  it("scales whole-token input by decimals", () => {
    expect(toBaseUnits("1", 18)).toBe(10n ** 18n);
    expect(toBaseUnits("1.5", 6)).toBe(1_500_000n);
  });
  it("rejects empty, non-positive, and over-precise input", () => {
    expect(toBaseUnits("", 18)).toBeNull();
    expect(toBaseUnits("0", 18)).toBeNull();
    expect(toBaseUnits("1.1234567", 6)).toBeNull(); // more dp than decimals
    expect(toBaseUnits("abc", 18)).toBeNull();
  });
});

describe("computeDistribution", () => {
  it("equal: every valid address gets perWalletBase; invalid rows get null", () => {
    const rows = [row(A, ""), row("bad", ""), row(B, "")];
    const d = computeDistribution(rows, {
      mode: "equal",
      perWalletBase: 10n,
      totalBase: null,
      capBase: null,
    });
    expect(d.airdrops).toEqual([10n, null, 10n]);
    expect(d.total).toBe(20n);
    expect(d.count).toBe(2);
  });

  it("equal: caps each wallet at capBase", () => {
    const d = computeDistribution([row(A, ""), row(B, "")], {
      mode: "equal",
      perWalletBase: 100n,
      totalBase: null,
      capBase: 30n,
    });
    expect(d.airdrops).toEqual([30n, 30n]);
    expect(d.total).toBe(60n);
  });

  it("prorata: splits total by balance, remainder to the largest holder for an exact sum", () => {
    // balances 1 and 2, total 10 → 3 and 6 (=9), remainder 1 → largest gets 7.
    const d = computeDistribution([row(A, "1"), row(B, "2")], {
      mode: "prorata",
      perWalletBase: null,
      totalBase: 10n,
      capBase: null,
    });
    expect(d.airdrops).toEqual([3n, 7n]);
    expect(d.total).toBe(10n); // exact
  });

  it("sqrt: weights by floor(√balance), dampening the whale", () => {
    // balances 1 and 100 → weights 1 and 10, total 22 → 2 and 20.
    const d = computeDistribution([row(A, "1"), row(B, "100")], {
      mode: "sqrt",
      perWalletBase: null,
      totalBase: 22n,
      capBase: null,
    });
    expect(d.airdrops).toEqual([2n, 20n]);
    expect(d.total).toBe(22n);
  });

  it("prorata: cap applied after the remainder can leave the sum below total", () => {
    // Without cap: [3, 7] (see above). Cap 5 clamps the 7 → [3, 5].
    const d = computeDistribution([row(A, "1"), row(B, "2")], {
      mode: "prorata",
      perWalletBase: null,
      totalBase: 10n,
      capBase: 5n,
    });
    expect(d.airdrops).toEqual([3n, 5n]);
    expect(d.total).toBe(8n);
  });

  it("returns all-null when the required input is missing or weights sum to zero", () => {
    expect(
      computeDistribution([row(A, "1")], {
        mode: "equal",
        perWalletBase: null,
        totalBase: null,
        capBase: null,
      }).airdrops,
    ).toEqual([null]);
    // prorata with only zero balances → no distribution.
    const zero = computeDistribution([row(A, "0"), row(B, "0")], {
      mode: "prorata",
      perWalletBase: null,
      totalBase: 10n,
      capBase: null,
    });
    expect(zero.airdrops).toEqual([null, null]);
    expect(zero.count).toBe(0);
  });

  it("three-way prorata keeps the sum exact via the remainder", () => {
    // balances 1,1,1 total 10 → 3,3,3 (=9), remainder 1 to the first max (C's row here).
    const d = computeDistribution([row(A, "1"), row(B, "1"), row(C, "1")], {
      mode: "prorata",
      perWalletBase: null,
      totalBase: 10n,
      capBase: null,
    });
    expect(d.total).toBe(10n);
    expect(d.airdrops.reduce<bigint>((s, a) => s + (a ?? 0n), 0n)).toBe(10n);
  });
});
