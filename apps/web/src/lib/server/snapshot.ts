import { randomUUID } from "node:crypto";
import { createPublicClient, http, isAddress, type Address, type PublicClient } from "viem";
import { sepolia } from "viem/chains";
import {
  buildSnapshotDrop,
  type AllocationMode,
  type ScanProgress,
  type SnapshotParams,
  type SnapshotResult,
  type TokenKind,
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

/**
 * Optional shared-secret gate for the snapshot routes. When SNAPSHOT_API_SECRET
 * is set, callers must send `Authorization: Bearer <secret>`; when unset the
 * routes are open (dev default — abuse is bounded by the per-IP rate limit).
 * Returns an error string when the request should be rejected, else null.
 * (A full operator-session auth — SIWE, see M3 — is the production path.)
 */
export function snapshotAuthError(authHeader: string | null): string | null {
  const secret = process.env.SNAPSHOT_API_SECRET;
  if (!secret) return null;
  return authHeader === `Bearer ${secret}` ? null : "Unauthorized";
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
  // Prune stale buckets each call so the map can't grow unbounded.
  for (const [key, ts] of hits) {
    const live = ts.filter((t) => now - t < windowMs);
    if (live.length === 0) hits.delete(key);
    else hits.set(key, live);
  }
  const recent = hits.get(ip) ?? [];
  if (recent.length >= limit) return true;
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
    if (fb > block) return { error: "fromBlock cannot be greater than block" };
    fromBlock = fb;
  }

  // Token standard (default erc20 keeps the original request shape working).
  let kind: TokenKind = "erc20";
  if (b.kind !== undefined) {
    if (b.kind !== "erc20" && b.kind !== "erc721" && b.kind !== "erc1155") {
      return { error: "kind must be 'erc20', 'erc721', or 'erc1155'" };
    }
    kind = b.kind;
  }

  let tokenId: bigint | undefined;
  if (kind === "erc1155") {
    const tid = toBigInt(b.tokenId);
    if (tid === null) return { error: "erc1155 requires a valid tokenId" };
    tokenId = tid;
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
    kind,
    ...(fromBlock !== undefined ? { fromBlock } : {}),
    ...(tokenId !== undefined ? { tokenId } : {}),
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
