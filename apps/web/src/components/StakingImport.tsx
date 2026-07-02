"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Download, Loader2, Play } from "lucide-react";
import { isAddress, parseUnits } from "viem";
import { toCsv } from "@/lib/reports";
import { downloadCsv } from "@/lib/downloadCsv";
import {
  snapshotStakes,
  DEPOSIT_MANAGER,
  STAKE_DECIMALS,
  DEFAULT_BATCH,
  MIN_BATCH,
  MAX_BATCH,
} from "@/lib/stake";
import type { Recipient } from "@/components/DuneImport";

/**
 * Tokamak staking snapshot — a two-step flow, because a staked balance can't be
 * read the way ERC-20/NFT holders are:
 *
 *   1) Candidate addresses — every account that ever staked, from the
 *      DepositManager `Deposited` event, extracted on the operator's own Dune
 *      account (pasted results URL, same path as the holder import).
 *   2) Staked balance — each candidate's `SeigManager.stakeOf(account)` at a
 *      chosen block (or latest), read client-side via eth_call over the
 *      operator's own RPC (no server key). This is the seigniorage-inclusive
 *      amount; event sums would undercount it.
 *
 * The result is an `{ address, amount }` list (amount = staked WTON, 27-dec)
 * loaded into the builder grid, where the operator picks the distribution.
 */

// Candidate-extraction query: distinct depositors up to the snapshot block.
// Raw-logs form so it works whether or not DepositManager is decoded on Dune.
// `total` (deposit count) is a throwaway column — the tool only reads the
// address here; the real balance comes from step 2.
const CANDIDATE_SQL = `SELECT bytearray_substring(data, 13, 20) AS address,
       COUNT(*) AS total
FROM ethereum.logs
WHERE contract_address = ${DEPOSIT_MANAGER}
  AND topic0 = keccak(to_utf8('Deposited(address,address,uint256)'))
  AND block_number <= {{snapshot_block}}
GROUP BY 1
ORDER BY total DESC`;

type Phase = 1 | 2;

export function StakingImport({ onRows }: { onRows: (rows: Recipient[]) => void }) {
  const [phase, setPhase] = useState<Phase>(1);

  // Step 1 — candidate extraction via Dune.
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [candidates, setCandidates] = useState<string[]>([]);
  // /api/dune caps results at 100k; a truncated candidate set means an
  // incomplete depositor universe, so surface it before the snapshot.
  const [candidatesTruncated, setCandidatesTruncated] = useState(false);
  const [copied, setCopied] = useState(false);

  // Step 2 — stakeOf snapshot, called from the browser over the operator's own
  // RPC (no server key). `when` = a pinned historical block (archive node) or
  // current state (`latest`, which a public RPC can serve).
  const [rpcUrl, setRpcUrl] = useState("");
  const [when, setWhen] = useState<"block" | "latest">("block");
  const [block, setBlock] = useState("");
  const [minStake, setMinStake] = useState("");
  const [batchSize, setBatchSize] = useState(String(DEFAULT_BATCH));
  const [snapping, setSnapping] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Recipient[] | null>(null);
  // stakeOf calls that reverted — a non-zero count means the snapshot is
  // incomplete (surfaced as a warning rather than silently dropped).
  const [failedCount, setFailedCount] = useState(0);

  const [error, setError] = useState<string | null>(null);

  const blockValid = /^\d+$/.test(block.trim()) && Number(block.trim()) > 0;
  // Block only matters when pinning history; "latest" needs no block.
  const blockOk = when === "latest" || blockValid;
  const minStakeValid = minStake.trim() === "" || /^\d+(\.\d+)?$/.test(minStake.trim());
  // Require https (a browser on an https page can't call an http RPC — mixed
  // content), with an http localhost exception for local dev.
  const rpcTrimmed = rpcUrl.trim();
  const rpcValid =
    /^https:\/\/\S+$/.test(rpcTrimmed) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?$/.test(rpcTrimmed);
  const batchNum = Number(batchSize.trim());
  const batchValid =
    Number.isInteger(batchNum) && batchNum >= MIN_BATCH && batchNum <= MAX_BATCH;

  const csv = useMemo(
    () => (result ? toCsv(["address", "amount"], result.map((r) => [r.address, r.amount])) : ""),
    [result],
  );

  async function fetchCandidates() {
    setFetching(true);
    setError(null);
    setCandidates([]);
    setCandidatesTruncated(false);
    setResult(null);
    try {
      const res = await fetch("/api/dune", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status}).`);
      const rows: Recipient[] = data.rows ?? [];
      // De-dupe addresses (case-insensitively); we only need the address set.
      const seen = new Set<string>();
      const addrs: string[] = [];
      for (const r of rows) {
        const a = r.address.trim();
        if (!isAddress(a, { strict: false })) continue;
        const key = a.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          addrs.push(a);
        }
      }
      if (addrs.length === 0) throw new Error("No depositor addresses in that result.");
      setCandidates(addrs);
      setCandidatesTruncated(Boolean(data.truncated));
      setPhase(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Candidate fetch failed.");
    } finally {
      setFetching(false);
    }
  }

  async function snapshotBalances() {
    if (!rpcValid) {
      setError("Enter a valid RPC URL (https://…).");
      return;
    }
    if (when === "block" && !blockValid) {
      setError("Enter a valid snapshot block number.");
      return;
    }
    if (!batchValid) {
      setError(`Batch size must be between ${MIN_BATCH} and ${MAX_BATCH}.`);
      return;
    }
    setSnapping(true);
    setError(null);
    setResult(null);
    setFailedCount(0);
    setProgress({ done: 0, total: candidates.length });
    try {
      // minStake is entered in whole WTON; convert to the 27-dec base unit.
      const minStakeBase =
        minStake.trim() === "" ? 0n : parseUnits(minStake.trim(), STAKE_DECIMALS);
      const { rows, failed } = await snapshotStakes({
        rpcUrl: rpcUrl.trim(),
        addresses: candidates,
        block: when === "block" ? BigInt(block.trim()) : undefined,
        minStake: minStakeBase,
        batchSize: batchNum,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      if (rows.length === 0) {
        throw new Error("No staker met the threshold at that block.");
      }
      setResult(rows);
      setFailedCount(failed);
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message.split("\n")[0]} (check the RPC is a mainnet archive node and allows browser CORS).`
          : "Stake snapshot failed.",
      );
    } finally {
      setSnapping(false);
      setProgress(null);
    }
  }

  function copySql() {
    navigator.clipboard?.writeText(CANDIDATE_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-slate-100">Tokamak staking snapshot</h2>
        <p className="mt-1 text-[11px] text-slate-500">
          Two steps: pull the addresses that staked (from a Dune query on your own
          account), then read each one&apos;s staked balance at a chosen block via{" "}
          <span className="font-mono">stakeOf</span> — seigniorage included, which
          event sums can&apos;t give you.
        </p>
      </div>

      {/* Sub-step indicator */}
      <div className="flex items-center gap-2">
        <StepChip n={1} label="Extract stakers" active={phase === 1} done={candidates.length > 0} />
        <span className="h-px w-5 bg-slate-800" />
        <StepChip n={2} label="Snapshot balances" active={phase === 2} done={!!result} />
      </div>

      {phase === 1 && (
        <div className="space-y-4">
          <p className="text-[11px] text-slate-400">
            Every account that ever staked (from the DepositManager{" "}
            <span className="font-mono">Deposited</span> event) up to your snapshot
            block. Some may have since unstaked — step 2 keeps only those still
            staked ≥ your threshold.
          </p>

          <details className="rounded-lg border border-slate-800 bg-slate-950 open:pb-3">
            <summary className="cursor-pointer px-4 py-2.5 text-xs font-mono font-semibold text-slate-200 select-none">
              How to run the query on Dune ▾
            </summary>
            <ol className="mt-1 space-y-1.5 px-4 text-[11px] text-slate-400 list-decimal list-inside">
              <li>
                Log in at{" "}
                <a href="https://dune.com/" target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline">
                  dune.com
                </a>{" "}
                and create a new query.
              </li>
              <li>
                Paste the SQL below, replacing{" "}
                <span className="font-mono text-emerald-600">{"{{snapshot_block}}"}</span> with your
                block number.
              </li>
              <li>
                Run it, then open <span className="font-mono text-slate-200">API</span> →{" "}
                <span className="font-mono text-slate-200">Preview API</span> to get the results URL
                (it includes your api_key).
              </li>
              <li>Paste that URL below and fetch the candidate list.</li>
            </ol>
            <div className="mx-4 mt-2 relative">
              <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900 p-3 text-[10.5px] leading-relaxed font-mono text-slate-300">
                {CANDIDATE_SQL}
              </pre>
              <button
                type="button"
                onClick={copySql}
                className="absolute top-2 right-2 inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-950/80 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:border-slate-600"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy SQL"}
              </button>
            </div>
            <p className="mt-2 px-4 text-[10.5px] text-slate-500">
              Targets Ethereum mainnet DepositManager (
              <span className="font-mono break-all">{DEPOSIT_MANAGER}</span>).
            </p>
          </details>

          <div>
            <label className="text-[11px] text-slate-400">Dune results API URL</label>
            <input
              className="input mt-1 font-mono text-xs"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.dune.com/api/v1/query/…/results?api_key=…"
              disabled={fetching}
              spellCheck={false}
            />
          </div>

          <button
            type="button"
            onClick={fetchCandidates}
            disabled={fetching || url.trim() === ""}
            className="btn btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {fetching ? "Fetching…" : "Fetch stakers"}
          </button>
        </div>
      )}

      {phase === 2 && (
        <div className="space-y-4">
          <p className="text-xs text-slate-300 font-mono">
            {candidates.length.toLocaleString()} candidate stakers
            {candidatesTruncated && (
              <span className="text-amber-600"> · capped at 100k — narrow the block range</span>
            )}
            <button
              type="button"
              onClick={() => setPhase(1)}
              className="ml-2 text-emerald-600 hover:underline font-sans font-normal"
            >
              ← change
            </button>
          </p>

          {/* When to read: a pinned historical block, or current state. */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300">Read balances at</label>
            <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5">
              <WhenBtn active={when === "block"} onClick={() => setWhen("block")}>
                Specific block
              </WhenBtn>
              <WhenBtn active={when === "latest"} onClick={() => setWhen("latest")}>
                Current state (latest)
              </WhenBtn>
            </div>
            {when === "block" ? (
              <div className="space-y-1 pt-1">
                <input
                  className="input font-mono text-xs"
                  value={block}
                  onChange={(e) => setBlock(e.target.value)}
                  placeholder="e.g. 25442574"
                  inputMode="numeric"
                />
                <p className={`text-[11px] ${block.trim() !== "" && !blockValid ? "text-red-500" : "text-slate-500"}`}>
                  {block.trim() !== "" && !blockValid
                    ? "Enter a positive block number."
                    : "stakeOf is read at this block — needs an archive node."}
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 pt-1">
                Reads the current staked balance — a public mainnet RPC works (no
                archive node needed).
              </p>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-mono text-slate-300">Min staked (WTON, optional)</label>
              <input
                className="input font-mono text-xs"
                value={minStake}
                onChange={(e) => setMinStake(e.target.value)}
                placeholder="0 = every staker"
                inputMode="decimal"
              />
              <p className={`text-[11px] ${!minStakeValid ? "text-red-500" : "text-slate-500"}`}>
                {!minStakeValid ? "Enter a number." : "Keep only stakers at or above this."}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-mono text-slate-300">Addresses per request</label>
              <input
                className="input font-mono text-xs"
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value)}
                placeholder={String(DEFAULT_BATCH)}
                inputMode="numeric"
              />
              <p className={`text-[11px] ${!batchValid ? "text-red-500" : "text-slate-500"}`}>
                {!batchValid
                  ? `Enter ${MIN_BATCH}–${MAX_BATCH}.`
                  : `stakeOf calls per multicall (${MIN_BATCH}–${MAX_BATCH}). Lower if the RPC rate-limits.`}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono text-slate-300">Mainnet RPC URL</label>
            <input
              className="input font-mono text-xs"
              value={rpcUrl}
              onChange={(e) => setRpcUrl(e.target.value)}
              placeholder="https://…"
              disabled={snapping}
              spellCheck={false}
            />
            <p className={`text-[11px] ${rpcUrl.trim() !== "" && !rpcValid ? "text-red-500" : "text-slate-500"}`}>
              {rpcUrl.trim() !== "" && !rpcValid
                ? "Enter a valid https:// RPC URL."
                : "stakeOf runs from your browser against this RPC (must allow browser CORS)."}
            </p>
          </div>

          <button
            type="button"
            onClick={snapshotBalances}
            disabled={snapping || !rpcValid || !blockOk || !minStakeValid || !batchValid}
            className="btn btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {snapping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {snapping ? "Reading stakeOf…" : "Snapshot balances"}
          </button>

          {progress && (
            <div className="space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded bg-slate-800">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 font-mono">
                {progress.done.toLocaleString()} / {progress.total.toLocaleString()} addresses read
              </p>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {result && (
        <div className="space-y-2 border-t border-slate-800 pt-3">
          <p className="text-xs text-slate-300 font-mono">
            {result.length.toLocaleString()} stakers{" "}
            {when === "block" ? `at block ${block.trim()}` : "at current state"}
          </p>
          {failedCount > 0 && (
            <p className="text-[11px] text-amber-600">
              {failedCount.toLocaleString()} stakeOf call(s) failed and were skipped — the
              snapshot is incomplete. Re-run (lower the batch size or try another RPC) before
              using the list.
            </p>
          )}
          <p className="text-[11px] text-slate-500">
            Amount is each account&apos;s staked balance in 27-decimal (RAY) base units —
            usable directly as a pro-rata weight in the grid below.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadCsv("stake-recipients.csv", `${csv}\n`)}
              className="btn inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Download CSV
            </button>
            <button
              type="button"
              onClick={() => onRows(result)}
              className="inline-flex items-center gap-2 bg-slate-950 border border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-600 font-semibold px-4 py-2 rounded-lg text-sm transition"
            >
              Load into the list ↓
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WhenBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
        active ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function StepChip({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
        active
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
          : "border-slate-800 bg-slate-950 text-slate-400"
      }`}
    >
      <span
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-mono ${
          done ? "bg-emerald-500 text-white" : active ? "bg-emerald-500/30 text-emerald-600" : "bg-slate-800 text-slate-400"
        }`}
      >
        {done ? "✓" : n}
      </span>
      {label}
    </span>
  );
}
