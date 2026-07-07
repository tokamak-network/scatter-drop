import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { telegramOAuth } from "./telegram";

const BOT_TOKEN = "123456789:FAKE-TEST-TOKEN-not-real";

/** Build a signed callback query the way Telegram itself would. */
function signedParams(fields: Record<string, string>): URLSearchParams {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secretKey = createHash("sha256").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash });
}

describe("telegramOAuth", () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
  });
  afterEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = originalToken;
  });

  it("configured() is true only when TELEGRAM_BOT_TOKEN is set with a numeric bot id", () => {
    expect(telegramOAuth.configured()).toBe(true);
    process.env.TELEGRAM_BOT_TOKEN = "not-a-valid-token";
    expect(telegramOAuth.configured()).toBe(false);
  });

  it("accepts a correctly-signed, fresh login payload", async () => {
    const params = signedParams({
      id: "555000111",
      first_name: "Ada",
      username: "ada_dev",
      auth_date: String(Math.floor(Date.now() / 1000)),
    });
    const result = await telegramOAuth.fetchUser(params, "https://example.test/callback");
    expect(result).toEqual({ id: "555000111", quality: JSON.stringify({ username: "ada_dev" }) });
  });

  it("verifies a payload carrying a Telegram field not in a fixed allow-list", async () => {
    // Telegram can sign extra fields (e.g. language_code); the data-check-string is
    // built from all received fields, so this must still verify rather than fail.
    const params = signedParams({
      id: "555000111",
      first_name: "Ada",
      username: "ada_dev",
      language_code: "en",
      auth_date: String(Math.floor(Date.now() / 1000)),
    });
    const result = await telegramOAuth.fetchUser(params, "https://example.test/callback");
    expect(result).toEqual({ id: "555000111", quality: JSON.stringify({ username: "ada_dev" }) });
  });

  it("ignores our own unsigned `state` param when verifying", async () => {
    const params = signedParams({
      id: "555000111",
      auth_date: String(Math.floor(Date.now() / 1000)),
    });
    params.set("state", "csrf-round-trip"); // added by us, not signed by Telegram
    const result = await telegramOAuth.fetchUser(params, "https://example.test/callback");
    expect(result).toEqual({ id: "555000111", quality: JSON.stringify({ username: null }) });
  });

  it("tolerates minor clock skew (auth_date slightly in the future)", async () => {
    const params = signedParams({
      id: "555000111",
      auth_date: String(Math.floor(Date.now() / 1000) + 60), // 1 min ahead
    });
    const result = await telegramOAuth.fetchUser(params, "https://example.test/callback");
    expect(result).toEqual({ id: "555000111", quality: JSON.stringify({ username: null }) });
  });

  it("rejects a payload with a tampered hash", async () => {
    const params = signedParams({
      id: "555000111",
      first_name: "Ada",
      auth_date: String(Math.floor(Date.now() / 1000)),
    });
    params.set("id", "999999999"); // tamper after signing
    const result = await telegramOAuth.fetchUser(params, "https://example.test/callback");
    expect(result).toEqual({ error: expect.stringContaining("signature") });
  });

  it("rejects a stale login payload", async () => {
    const params = signedParams({
      id: "555000111",
      auth_date: String(Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60), // 2 days old
    });
    const result = await telegramOAuth.fetchUser(params, "https://example.test/callback");
    expect(result).toEqual({ error: expect.stringContaining("expired") });
  });

  it("rejects a payload missing required fields", async () => {
    const result = await telegramOAuth.fetchUser(
      new URLSearchParams({ id: "555000111" }),
      "https://example.test/callback",
    );
    expect(result).toEqual({ error: expect.stringContaining("signed login payload") });
  });
});
