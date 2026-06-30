"use client";

import { useEffect, useState } from "react";

/**
 * Returns false on the server and on the first client render, then true after
 * mount. Use to gate wallet-derived UI (wagmi `useAccount` etc.) so the server
 * markup matches the first client paint and React does not warn about a
 * hydration mismatch.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
