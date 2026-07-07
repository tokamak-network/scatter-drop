import { describe, expect, it } from "vitest";
import { parseQuestCreate, parseQuestPatch } from "./questInput";

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();

const VALID_BODY = {
  chainId: 1,
  title: "Community quest",
  closesAt: FUTURE,
  totalAmount: "1000",
  tasks: [{ kind: "DISCORD_JOIN", config: { guildId: "123456789012345" }, required: true }],
};

describe("parseQuestCreate", () => {
  it("accepts a valid campaign", () => {
    const result = parseQuestCreate(VALID_BODY);
    expect("value" in result).toBe(true);
  });

  it("rejects a non-equal amountMode (§9: v1 is equal-split only)", () => {
    const result = parseQuestCreate({ ...VALID_BODY, amountMode: "fixed-per-task" });
    expect(result).toEqual({ error: expect.stringContaining("equal") });
  });

  it("rejects a closesAt in the past", () => {
    const result = parseQuestCreate({ ...VALID_BODY, closesAt: "2020-01-01T00:00:00Z" });
    expect(result).toEqual({ error: expect.stringContaining("future") });
  });

  it("rejects a non-positive totalAmount", () => {
    const result = parseQuestCreate({ ...VALID_BODY, totalAmount: "0" });
    expect(result).toEqual({ error: expect.stringContaining("totalAmount") });
  });

  it("rejects an empty tasks array", () => {
    const result = parseQuestCreate({ ...VALID_BODY, tasks: [] });
    expect(result).toEqual({ error: expect.stringContaining("tasks") });
  });

  it("rejects an unsupported task kind (X excluded per §9)", () => {
    const result = parseQuestCreate({
      ...VALID_BODY,
      tasks: [{ kind: "X_FOLLOW", config: {}, required: true }],
    });
    expect(result).toEqual({ error: expect.stringContaining("kind") });
  });

  it("rejects a DISCORD_JOIN task with a malformed guildId", () => {
    const result = parseQuestCreate({
      ...VALID_BODY,
      tasks: [{ kind: "DISCORD_JOIN", config: { guildId: "not-a-snowflake" }, required: true }],
    });
    expect(result).toEqual({ error: expect.stringContaining("guildId") });
  });

  it("requires roleId for DISCORD_ROLE", () => {
    const result = parseQuestCreate({
      ...VALID_BODY,
      tasks: [
        { kind: "DISCORD_ROLE", config: { guildId: "123456789012345" }, required: true },
      ],
    });
    expect(result).toEqual({ error: expect.stringContaining("roleId") });
  });

  it("rejects a LINK_VISIT task with a non-https url", () => {
    const result = parseQuestCreate({
      ...VALID_BODY,
      tasks: [{ kind: "LINK_VISIT", config: { url: "http://insecure.example" }, required: true }],
    });
    expect(result).toEqual({ error: expect.stringContaining("url") });
  });

  it("rejects a prototype-chain property masquerading as a kind", () => {
    const result = parseQuestCreate({
      ...VALID_BODY,
      tasks: [{ kind: "toString", config: {}, required: true }],
    });
    expect(result).toEqual({ error: expect.stringContaining("kind") });
  });

  it("rejects a non-boolean required field", () => {
    const result = parseQuestCreate({
      ...VALID_BODY,
      tasks: [
        { kind: "DISCORD_JOIN", config: { guildId: "123456789012345" }, required: "yes" },
      ],
    });
    expect(result).toEqual({ error: expect.stringContaining("required") });
  });

  it("defaults required to true when omitted", () => {
    const result = parseQuestCreate({
      ...VALID_BODY,
      tasks: [{ kind: "DISCORD_JOIN", config: { guildId: "123456789012345" } }],
    });
    expect("value" in result && result.value.tasks[0].required).toBe(true);
  });

  it("rejects a campaign where every task is optional", () => {
    const result = parseQuestCreate({
      ...VALID_BODY,
      tasks: [
        { kind: "DISCORD_JOIN", config: { guildId: "123456789012345" }, required: false },
      ],
    });
    expect(result).toEqual({ error: expect.stringContaining("required") });
  });

  it("rejects a null body", () => {
    expect(parseQuestCreate(null)).toEqual({ error: expect.stringContaining("object") });
  });

  it("rejects a primitive body", () => {
    expect(parseQuestCreate("nope")).toEqual({ error: expect.stringContaining("object") });
  });
});

describe("parseQuestPatch", () => {
  it("rejects an empty patch", () => {
    expect(parseQuestPatch({})).toEqual({ error: "empty patch" });
  });

  it("accepts clearing drop back to null", () => {
    const result = parseQuestPatch({ drop: null });
    expect(result).toEqual({ value: { drop: null } });
  });

  it("lowercases and validates a drop address", () => {
    const result = parseQuestPatch({ drop: "0xABCDEF0123456789ABCDEF0123456789ABCDEF01" });
    expect(result).toEqual({ value: { drop: "0xabcdef0123456789abcdef0123456789abcdef01" } });
  });

  it("rejects a malformed drop address", () => {
    expect(parseQuestPatch({ drop: "not-an-address" })).toEqual({
      error: expect.stringContaining("drop"),
    });
  });
});
