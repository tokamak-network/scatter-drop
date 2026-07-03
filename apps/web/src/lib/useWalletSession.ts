"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useSignMessage } from "wagmi";
import { SiweMessage } from "siwe";

export interface WalletSession {
  /** Lowercased signed-in wallet, or null when signed out. */
  address: string | null;
  /** Whether that wallet is on the platform-admin allow-list. */
  isAdmin: boolean;
}

const SIGNED_OUT: WalletSession = { address: null, isAdmin: false };
// Shared cache key: every mount of this hook reads the same session state, so
// N components don't fire N /api/auth/me round-trips.
const ME_KEY = ["auth", "me"] as const;

/**
 * SIWE sign-in for any connected wallet, against the shared /api/auth
 * endpoints. The session proves wallet ownership to authenticated API routes
 * (announcements, and — when `isAdmin` — the admin registry). Feature-specific
 * hooks (useAdminSession) layer their own gating on top.
 */
export function useWalletSession(statement = "Sign in to scatter.drop.") {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: me = SIGNED_OUT } = useQuery({
    queryKey: ME_KEY,
    staleTime: 15_000,
    queryFn: async (): Promise<WalletSession> => {
      const r = await fetch("/api/auth/me");
      // A failed read means the session expired/was revoked — report signed
      // out so the UI can't keep rendering session-gated controls.
      return r.ok ? ((await r.json()) as WalletSession) : SIGNED_OUT;
    },
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ME_KEY });
  }, [queryClient]);

  const signIn = useCallback(async (): Promise<WalletSession | null> => {
    if (!address) return null;
    setBusy(true);
    setError(null);
    try {
      const nonce = await (await fetch("/api/auth/nonce")).text();
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement,
        uri: window.location.origin,
        version: "1",
        chainId: chainId ?? 1,
        nonce,
      }).prepareMessage();
      const signature = await signMessageAsync({ message });
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sign-in failed");
        return null;
      }
      const session: WalletSession = { address: data.address, isAdmin: data.isAdmin };
      queryClient.setQueryData(ME_KEY, session);
      return session;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      return null;
    } finally {
      setBusy(false);
    }
  }, [address, chainId, signMessageAsync, statement, queryClient]);

  /**
   * The session for `expected` (a lowercase-insensitive wallet address),
   * signing in when the current session is missing or belongs to another
   * wallet. Call this in front of any authenticated write so "session must
   * match the acting wallet" lives in one place. Null when the user rejects
   * the signature or the connected wallet can't produce `expected`'s session.
   */
  const ensureSession = useCallback(
    async (expected?: string): Promise<WalletSession | null> => {
      const target = expected?.toLowerCase();
      if (me.address && (!target || me.address === target)) return me;
      const session = await signIn();
      if (!session || (target && session.address !== target)) return null;
      return session;
    },
    [me, signIn],
  );

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    queryClient.setQueryData(ME_KEY, SIGNED_OUT);
  }, [queryClient]);

  return { me, signIn, ensureSession, signOut, busy, error, setError, refresh };
}
