import { describe, expect, it } from "vitest";
import { bindError, walletAlreadyBoundError, REBIND_COOLDOWN_MS } from "./socialBindings";

describe("bindError", () => {
  it("allows a fresh (never-bound) account", () => {
    expect(bindError(null, "0xaaa")).toBeNull();
  });

  it("is idempotent for the wallet that already holds the active binding", () => {
    expect(bindError({ wallet: "0xaaa", unboundAt: null }, "0xaaa")).toBeNull();
  });

  it("refuses an active binding held by a different wallet", () => {
    expect(bindError({ wallet: "0xaaa", unboundAt: null }, "0xbbb")).toMatch(/already linked/);
  });

  it("refuses a rebind before the cooldown elapses", () => {
    const now = new Date("2026-01-08T00:00:00Z");
    const unboundAt = new Date("2026-01-07T00:00:00Z"); // 1 day ago
    expect(bindError({ wallet: "0xaaa", unboundAt }, "0xbbb", now)).toMatch(/recently unlinked/);
  });

  it("allows a rebind once the cooldown has elapsed", () => {
    const unboundAt = new Date("2026-01-01T00:00:00Z");
    const now = new Date(unboundAt.getTime() + REBIND_COOLDOWN_MS + 1);
    expect(bindError({ wallet: "0xaaa", unboundAt }, "0xbbb", now)).toBeNull();
  });
});

describe("walletAlreadyBoundError", () => {
  it("allows binding when the wallet has no active account for the provider", () => {
    expect(walletAlreadyBoundError(null, "acct-1")).toBeNull();
  });

  it("is idempotent for the same account", () => {
    expect(walletAlreadyBoundError("acct-1", "acct-1")).toBeNull();
  });

  it("refuses a second account for a wallet that already has one active", () => {
    expect(walletAlreadyBoundError("acct-1", "acct-2")).toMatch(/already has a linked account/);
  });
});
