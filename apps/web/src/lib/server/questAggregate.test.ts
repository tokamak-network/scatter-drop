import { describe, expect, it } from "vitest";
import { eligibleWallets, equalSplit } from "./questAggregate";

const TASKS = [
  { id: "t1", kind: "DISCORD_JOIN", required: true },
  { id: "t2", kind: "LINK_VISIT", required: true },
  { id: "t3", kind: "DISCORD_ROLE", required: false },
];

describe("eligibleWallets", () => {
  it("requires every required task, ignores optional ones", () => {
    const completions = [
      { wallet: "0xaaa", taskId: "t1" },
      { wallet: "0xaaa", taskId: "t2" },
      { wallet: "0xbbb", taskId: "t1" }, // missing t2
    ];
    const bindings = [{ provider: "discord", wallet: "0xaaa" }];
    expect(eligibleWallets(TASKS, completions, bindings)).toEqual(["0xaaa"]);
  });

  it("excludes a social completion when the binding is no longer active", () => {
    const completions = [
      { wallet: "0xaaa", taskId: "t1" },
      { wallet: "0xaaa", taskId: "t2" },
    ];
    // No active binding for 0xaaa on discord — t1 (DISCORD_JOIN) doesn't count.
    expect(eligibleWallets(TASKS, completions, [])).toEqual([]);
  });

  it("excludes a completion when the account rebound to a different wallet", () => {
    const completions = [
      { wallet: "0xaaa", taskId: "t1" },
      { wallet: "0xaaa", taskId: "t2" },
    ];
    // Active binding exists, but for wallet 0xbbb, not the completing wallet.
    const bindings = [{ provider: "discord", wallet: "0xbbb" }];
    expect(eligibleWallets(TASKS, completions, bindings)).toEqual([]);
  });

  it("returns nothing when there are no required tasks", () => {
    const optionalOnly = [{ id: "t1", kind: "LINK_VISIT", required: false }];
    expect(eligibleWallets(optionalOnly, [{ wallet: "0xaaa", taskId: "t1" }], [])).toEqual([]);
  });

  it("sorts the result", () => {
    const linkOnly = [{ id: "t1", kind: "LINK_VISIT", required: true }];
    const completions = [
      { wallet: "0xccc", taskId: "t1" },
      { wallet: "0xaaa", taskId: "t1" },
      { wallet: "0xbbb", taskId: "t1" },
    ];
    expect(eligibleWallets(linkOnly, completions, [])).toEqual(["0xaaa", "0xbbb", "0xccc"]);
  });
});

describe("equalSplit", () => {
  it("splits evenly with no remainder", () => {
    expect(equalSplit("100", 4)).toBe("25");
  });

  it("floors instead of over-promising the pot", () => {
    expect(equalSplit("10", 3)).toBe("3.333333333333333333");
  });

  it("returns null for zero or negative wallet counts", () => {
    expect(equalSplit("100", 0)).toBeNull();
    expect(equalSplit("100", -1)).toBeNull();
  });

  it("handles decimal totals", () => {
    expect(equalSplit("1.5", 3)).toBe("0.5");
  });
});
