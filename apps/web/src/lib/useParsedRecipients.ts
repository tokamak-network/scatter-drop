"use client";

import { useEffect, useRef, useState } from "react";
import type { DropManifest } from "@tokamak-network/scatter-drop-sdk";
import { parseRecipients } from "./recipients";

export type ParsedRecipients = {
  manifest: DropManifest | null;
  error: string | null;
};

const EMPTY: ParsedRecipients = { manifest: null, error: null };

/**
 * Debounced CSV → Merkle drop build, shared by the campaign wizard and the
 * operator console's republish flow. Parsing/Merkle build is debounced so
 * large lists don't rebuild on every keystroke (a 50k-row build is
 * main-thread work). Amounts are human units scaled by the token's
 * `decimals`, so the build waits for them to resolve and re-runs on a token
 * switch; the ref guard skips rebuilding an identical tree when a token
 * re-read resolves to the same decimals. `tokenValid` distinguishes a
 * cleared/invalid token (drop the stale tree rather than keep showing a
 * manifest scaled for the previous token) from a mid-read undefined for the
 * SAME token, which resolves quickly and no-ops via the ref guard.
 */
export function useParsedRecipients(
  csv: string,
  decimals: number | undefined,
  tokenValid = true,
): ParsedRecipients {
  const [parsed, setParsed] = useState<ParsedRecipients>(EMPTY);
  const lastBuilt = useRef<{ csv: string; decimals: number } | null>(null);
  useEffect(() => {
    if (decimals === undefined) {
      if (!tokenValid && lastBuilt.current) {
        lastBuilt.current = null;
        setParsed(EMPTY);
      }
      return;
    }
    if (lastBuilt.current?.csv === csv && lastBuilt.current.decimals === decimals) return;
    const t = setTimeout(() => {
      lastBuilt.current = { csv, decimals };
      setParsed(parseRecipients(csv, decimals));
    }, 400);
    return () => clearTimeout(t);
    // tokenValid only matters on the decimals===undefined early return; the
    // ref guard makes re-runs no-ops, so satisfying the linter is free.
  }, [csv, decimals, tokenValid]);
  return parsed;
}
