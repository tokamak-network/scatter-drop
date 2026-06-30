import { randomUUID } from "node:crypto";
import { createPublicClient, http, isAddress, type Address, type PublicClient } from "viem";
import { sepolia } from "viem/chains";
import {
  buildSnapshotDrop,
  type AllocationMode,
  type ScanProgress,
  type SnapshotParams,
  type SnapshotResult,
} from "@tokamak-network/scatter-drop-snapshot";

/**
 * SNAP-3 server-only snapshot orchestration. The archive RPC key lives in
 * server env (ALCHEMY_RPC_URL / SEPOLIA_RPC_URL — never NEXT_PUBLIC), so this
 * module MUST NOT be imported from a "use client" component; it is used only by
 * the /api/snapshot route handlers.
 */

/** Hard cap on candidate addresses (CU-budget guard, passed to scanHolders). */
const MAX_CANDIDATES = 50_000;
/** Jobs are dropped from the in-memory store after this long. */
const JOB_TTL_MS = 30 * 60_000;

export function getServerRpcUrl(): string | null {
  return process.env.ALCHEMY_RPC_URL || process.env.SEPOLIA_RPC_URL || null;
}

function createSnapshotClient(rpc: string): PublicClient {
  // The archive node serves real Sepolia state (chain id 11155111) — the dev
  // fork re-labels to 31337 but keeps Sepolia state, so snapshots still work.
  return createPublicClient({ chain: sepolia, transport: http(rpc) });
}

export type JobState = "running" | "done" | "error";

export interface Job {
  id: string;
  state: JobState;
  progress: { phase: string; done: string; total?: string } | null;
  result: SnapshotResult | null;
  error: string | null;
  createdAt: number;
}

// In-memory job store (MVP — single process). Survives within one server
// instance; a multi-worker deploy would need shared storage.
const jobs = new Map<string, Job>();

function sweepExpired(now: number) {
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

// --- naive per-IP rate limit (in-memory sliding window) ---
const hits = new Map<string, number[]>();

export function rateLimited(ip: string, limit = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

// --- request validation (no zod dependency; manual + strict) ---
function toBigInt(v: unknown): bigint | null {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
  return null;
}

export function parseSnapshotRequest(
  body: unknown,
): { params: SnapshotParams; mode: AllocationMode } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid body" };
  const b = body as Record<string, unknown>;

  if (typeof b.token !== "string" || !isAddress(b.token)) {
    return { error: "Invalid token address" };
  }
  const block = toBigInt(b.block);
  if (block === null || block <= 0n) return { error: "Invalid block" };

  const minBalance = b.minBalance === undefined ? 0n : toBigInt(b.minBalance);
  if (minBalance === null) return { error: "Invalid minBalance" };

  let fromBlock: bigint | undefined;
  if (b.fromBlock !== undefined) {
    const fb = toBigInt(b.fromBlock);
    if (fb === null) return { error: "Invalid fromBlock" };
    fromBlock = fb;
  }

  const m = b.mode as Record<string, unknown> | undefined;
  if (!m || typeof m !== "object") return { error: "Invalid mode" };
  let mode: AllocationMode;
  if (m.kind === "equal") {
    const perWallet = toBigInt(m.perWallet);
    if (perWallet === null || perWallet <= 0n) return { error: "Invalid perWallet" };
    mode = { kind: "equal", perWallet };
  } else if (m.kind === "proRata") {
    const totalAmount = toBigInt(m.totalAmount);
    if (totalAmount === null || totalAmount <= 0n) return { error: "Invalid totalAmount" };
    mode = { kind: "proRata", totalAmount };
  } else {
    return { error: "mode.kind must be 'equal' or 'proRata'" };
  }

  const params: SnapshotParams = {
    token: b.token as Address,
    block,
    minBalance,
    ...(fromBlock !== undefined ? { fromBlock } : {}),
  };
  return { params, mode };
}

export function startSnapshotJob(
  params: SnapshotParams,
  mode: AllocationMode,
): { jobId: string } | { error: string } {
  const rpc = getServerRpcUrl();
  if (!rpc) {
    return {
      error:
        "Server RPC not configured (set ALCHEMY_RPC_URL or SEPOLIA_RPC_URL).",
    };
  }

  const now = Date.now();
  sweepExpired(now);

  const id = randomUUID();
  const job: Job = {
    id,
    state: "running",
    progress: null,
    result: null,
    error: null,
    createdAt: now,
  };
  jobs.set(id, job);

  const client = createSnapshotClient(rpc);
  // Fire-and-forget: progress + result are read back via polling.
  void (async () => {
    try {
      job.result = await buildSnapshotDrop(client, params, mode, {
        maxCandidates: MAX_CANDIDATES,
        onProgress: (p: ScanProgress) => {
          job.progress = {
            phase: p.phase,
            done: p.done.toString(),
            total: p.total?.toString(),
          };
        },
      });
      job.state = "done";
    } catch (e) {
      job.error = e instanceof Error ? e.message : "snapshot failed";
      job.state = "error";
    }
  })();

  return { jobId: id };
}
