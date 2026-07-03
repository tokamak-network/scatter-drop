"use client";

import { useCallback } from "react";
import { useWalletSession, type WalletSession } from "./useWalletSession";

export type AdminSession = WalletSession;

/**
 * SIWE sign-in for the platform admin (network registry management). Thin
 * layer over useWalletSession: any wallet can establish a session, so surface
 * a clear error here when the signed-in wallet isn't on the admin allow-list.
 */
export function useAdminSession() {
  const { me, signIn: walletSignIn, signOut, busy, error, setError, refresh } = useWalletSession(
    "Sign in as scatter.drop platform admin.",
  );

  const signIn = useCallback(async () => {
    const session = await walletSignIn();
    if (session && !session.isAdmin) setError("Not a platform admin");
  }, [walletSignIn, setError]);

  return { me, signIn, signOut, busy, error, refresh };
}
