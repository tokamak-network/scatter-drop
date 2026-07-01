"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { SiweMessage } from "siwe";

export interface AdminSession {
  address: string | null;
  isAdmin: boolean;
}

/** SIWE sign-in for the platform admin (network registry management). */
export function useAdminSession() {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [me, setMe] = useState<AdminSession>({ address: null, isAdmin: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/me");
      if (r.ok) setMe((await r.json()) as AdminSession);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async () => {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const nonce = await (await fetch("/api/auth/nonce")).text();
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in as scatter.drop platform admin.",
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
      if (!res.ok) setError(data.error ?? "Sign-in failed");
      else setMe({ address: data.address, isAdmin: data.isAdmin });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }, [address, chainId, signMessageAsync]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe({ address: null, isAdmin: false });
  }, []);

  return { me, signIn, signOut, busy, error, refresh };
}
