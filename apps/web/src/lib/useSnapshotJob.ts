"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Hex } from "viem";

/** Manifest returned by /api/snapshot/result (amounts are base-unit strings). */
export interface SnapshotManifest {
  merkleRoot: Hex;
  totalAmount: string;
  count: number;
  holderCount: number;
  claims: Record<string, { index: number; account: string; amount: string; proof: Hex[] }>;
}

export interface SnapshotJobInput {
  token: string;
  block: string;
  minBalance: string;
  mode:
    | { kind: "equal"; perWallet: string }
    | { kind: "proRata"; totalAmount: string };
  fromBlock?: string;
  /** Asset standard. Omitted = erc20 (also serves erc721). */
  kind?: "erc20" | "erc721" | "erc1155";
  /** Required when kind = "erc1155". */
  tokenId?: string;
}

type Phase = "idle" | "running" | "done" | "error";

const POLL_MS = 1500;
const TIMEOUT_MS = 180_000;

/**
 * Drives a SNAP-3 snapshot job from the client: POST /start, poll /status, then
 * GET /result. All RPC work stays server-side; this only talks to our routes.
 */
export function useSnapshotJob() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<{
    phase: string;
    done: string;
    total?: string;
  } | null>(null);
  const [result, setResult] = useState<SnapshotManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadline = useRef<number>(0);
  const stopped = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  // Cancel any in-flight polling on unmount.
  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
      clear();
    };
  }, []);

  const poll = useCallback(async (jobId: string) => {
    if (stopped.current) return;
    if (Date.now() > deadline.current) {
      setError("Snapshot timed out — try a higher fromBlock or smaller range.");
      setPhase("error");
      return;
    }
    try {
      const res = await fetch(
        `/api/snapshot/status?jobId=${encodeURIComponent(jobId)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (stopped.current) return;
      if (!res.ok) {
        setError(data.error ?? "status failed");
        setPhase("error");
        return;
      }
      setProgress(data.progress ?? null);
      if (data.state === "running") {
        timer.current = setTimeout(() => void poll(jobId), POLL_MS);
        return;
      }
      if (data.state === "error") {
        setError(data.error ?? "snapshot failed");
        setPhase("error");
        return;
      }
      // done → fetch the manifest
      const rr = await fetch(
        `/api/snapshot/result?jobId=${encodeURIComponent(jobId)}`,
        { cache: "no-store" },
      );
      const rdata = await rr.json();
      if (stopped.current) return;
      if (!rr.ok || rdata.state !== "done") {
        setError(rdata.error ?? "result unavailable");
        setPhase("error");
        return;
      }
      setResult(rdata.result as SnapshotManifest);
      setPhase("done");
    } catch (e) {
      if (stopped.current) return;
      setError(e instanceof Error ? e.message : "network error");
      setPhase("error");
    }
  }, []);

  const start = useCallback(
    async (input: SnapshotJobInput) => {
      clear();
      setPhase("running");
      setError(null);
      setResult(null);
      setProgress(null);
      deadline.current = Date.now() + TIMEOUT_MS;
      try {
        const res = await fetch("/api/snapshot/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to start snapshot");
          setPhase("error");
          return;
        }
        void poll(data.jobId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "network error");
        setPhase("error");
      }
    },
    [poll],
  );

  const reset = useCallback(() => {
    clear();
    setPhase("idle");
    setProgress(null);
    setResult(null);
    setError(null);
  }, []);

  return { phase, progress, result, error, start, reset };
}
