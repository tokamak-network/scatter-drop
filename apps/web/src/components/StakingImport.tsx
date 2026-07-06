"use client";

import { useMemo, useState } from "react";
import { Download, Loader2, Play } from "lucide-react";
import { isAddress, parseUnits } from "viem";
import { inkBtnClass, popInputClass, SEG_WRAP, whiteBtnClass } from "@/components/pop";
import { SegButton } from "@/components/popUi";
import { SqlCopyBlock } from "@/components/SqlCopyBlock";
import { toCsv } from "@/lib/reports";
import { downloadCsv } from "@/lib/download";
import {
  snapshotStakes,
  DEPOSIT_MANAGER,
  STAKE_DECIMALS,
  DEFAULT_BATCH,
  MIN_BATCH,
  MAX_BATCH,
} from "@/lib/stake";
import type { Recipient } from "@/lib/recipients";

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

// The shared pop field skin for this form's mono inputs.
const INPUT_CLS = `${popInputClass("rounded-full px-3 py-2 font-mono")} text-xs`;

export function StakingImport({ onRows }: { onRows: (rows: Recipient[]) => void }) {
  const [phase, setPhase] = useState<Phase>(1);

  // Step 1 — candidate extraction via Dune.
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [candidates, setCandidates] = useState<string[]>([]);
  // /api/dune caps results at 100k; a truncated candidate set means an
  // incomplete depositor universe, so surface it before the snapshot.
  const [candidatesTruncated, setCandidatesTruncated] = useState(false);

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
    () => (result ? toCsv(["address", "balance"], result.map((r) => [r.address, r.amount])) : ""),
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-ink">Tokamak staking snapshot</h2>
        <p className="mt-1 text-[11px] text-ink/50">
          Two steps: pull the addresses that staked (from a Dune query on your own
          account), then read each one&apos;s staked balance at a chosen block via{" "}
          <span className="font-mono">stakeOf</span> — seigniorage included, which
          event sums can&apos;t give you.
        </p>
      </div>

      {/* Sub-step indicator */}
      <div className="flex items-center gap-2">
        <StepChip n={1} label="Extract stakers" active={phase === 1} done={candidates.length > 0} />
        <span className="h-0.5 w-5 bg-ink/20" />
        <StepChip n={2} label="Snapshot balances" active={phase === 2} done={!!result} />
      </div>

      {phase === 1 && (
        <div className="space-y-4">
          <p className="text-[11px] text-ink/60">
            Every account that ever staked (from the DepositManager{" "}
            <span className="font-mono">Deposited</span> event) up to your snapshot
            block. Some may have since unstaked — step 2 keeps only those still
            staked ≥ your threshold.
          </p>

          <details className="rounded-2xl border border-ink/15 bg-pop-cream open:pb-3">
            <summary className="cursor-pointer px-4 py-2.5 text-xs font-mono font-semibold text-ink select-none">
              How to run the query on Dune ▾
            </summary>
            <ol className="mt-1 space-y-1.5 px-4 text-[11px] text-ink/60 list-decimal list-inside">
              <li>
                Log in at{" "}
                <a href="https://dune.com/" target="_blank" rel="noreferrer" className="text-sky-500 hover:underline">
                  dune.com
                </a>{" "}
                and create a new query.
              </li>
              <li>
                Paste the SQL below, replacing{" "}
                <span className="font-mono text-sky-500">{"{{snapshot_block}}"}</span> with your
                block number.
              </li>
              <li>
                Run it, then open <span className="font-mono text-ink">API</span> →{" "}
                <span className="font-mono text-ink">Preview API</span> to get the results URL
                (it includes your api_key).
              </li>
              <li>Paste that URL below and fetch the candidate list.</li>
            </ol>
            <div className="mx-4 mt-2">
              <SqlCopyBlock sql={CANDIDATE_SQL} />
            </div>
            <p className="mt-2 px-4 text-[10.5px] text-ink/50">
              Targets Ethereum mainnet DepositManager (
              <span className="font-mono break-all">{DEPOSIT_MANAGER}</span>).
            </p>
          </details>

          <div>
            <label className="text-[11px] text-ink/60">Dune results API URL</label>
            <input
              className={`${INPUT_CLS} mt-1`}
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
            className={`inline-flex items-center gap-1.5 text-sm disabled:opacity-50 disabled:pointer-events-none ${inkBtnClass("md")}`}
          >
            {fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {fetching ? "Fetching…" : "Fetch stakers"}
          </button>
        </div>
      )}

      {phase === 2 && (
        <div className="space-y-4">
          <p className="text-xs text-ink/70 font-mono">
            {candidates.length.toLocaleString()} candidate stakers
            {candidatesTruncated && (
              <span className="text-ink/70"> · capped at 100k — narrow the block range</span>
            )}
            <button
              type="button"
              onClick={() => setPhase(1)}
              className="ml-2 text-sky-500 hover:underline font-sans font-normal"
            >
              ← change
            </button>
          </p>

          {/* When to read: a pinned historical block, or current state. */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono font-bold text-ink/70">Read balances at</label>
            <div className={SEG_WRAP}>
              <SegButton active={when === "block"} onClick={() => setWhen("block")}>
                Specific block
              </SegButton>
              <SegButton active={when === "latest"} onClick={() => setWhen("latest")}>
                Current state (latest)
              </SegButton>
            </div>
            {when === "block" ? (
              <div className="space-y-1 pt-1">
                <input
                  className={INPUT_CLS}
                  value={block}
                  onChange={(e) => setBlock(e.target.value)}
                  placeholder="e.g. 25442574"
                  inputMode="numeric"
                />
                <p className={`text-[11px] ${block.trim() !== "" && !blockValid ? "text-rose-500" : "text-ink/50"}`}>
                  {block.trim() !== "" && !blockValid
                    ? "Enter a positive block number."
                    : "stakeOf is read at this block — needs an archive node."}
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-ink/50 pt-1">
                Reads the current staked balance — a public mainnet RPC works (no
                archive node needed).
              </p>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-mono font-bold text-ink/70">Min staked (WTON, optional)</label>
              <input
                className={INPUT_CLS}
                value={minStake}
                onChange={(e) => setMinStake(e.target.value)}
                placeholder="0 = every staker"
                inputMode="decimal"
              />
              <p className={`text-[11px] ${!minStakeValid ? "text-rose-500" : "text-ink/50"}`}>
                {!minStakeValid ? "Enter a number." : "Keep only stakers at or above this."}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-mono font-bold text-ink/70">Addresses per request</label>
              <input
                className={INPUT_CLS}
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value)}
                placeholder={String(DEFAULT_BATCH)}
                inputMode="numeric"
              />
              <p className={`text-[11px] ${!batchValid ? "text-rose-500" : "text-ink/50"}`}>
                {!batchValid
                  ? `Enter ${MIN_BATCH}–${MAX_BATCH}.`
                  : `stakeOf calls per multicall (${MIN_BATCH}–${MAX_BATCH}). Lower if the RPC rate-limits.`}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono font-bold text-ink/70">Mainnet RPC URL</label>
            <input
              className={INPUT_CLS}
              value={rpcUrl}
              onChange={(e) => setRpcUrl(e.target.value)}
              placeholder="https://…"
              disabled={snapping}
              spellCheck={false}
            />
            <p className={`text-[11px] ${rpcUrl.trim() !== "" && !rpcValid ? "text-rose-500" : "text-ink/50"}`}>
              {rpcUrl.trim() !== "" && !rpcValid
                ? "Enter a valid https:// RPC URL."
                : "stakeOf runs from your browser against this RPC (must allow browser CORS)."}
            </p>
          </div>

          <button
            type="button"
            onClick={snapshotBalances}
            disabled={snapping || !rpcValid || !blockOk || !minStakeValid || !batchValid}
            className={`inline-flex items-center gap-1.5 text-sm disabled:opacity-50 disabled:pointer-events-none ${inkBtnClass("md")}`}
          >
            {snapping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {snapping ? "Reading stakeOf…" : "Snapshot balances"}
          </button>

          {progress && (
            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-pop-cream border border-ink/15">
                <div
                  className="h-full bg-ink transition-all"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-[11px] text-ink/50 font-mono">
                {progress.done.toLocaleString()} / {progress.total.toLocaleString()} addresses read
              </p>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-rose-500">{error}</p>}

      {result && (
        <div className="space-y-2 border-t border-ink/10 pt-3">
          <p className="text-xs text-ink/70 font-mono">
            {result.length.toLocaleString()} stakers{" "}
            {when === "block" ? `at block ${block.trim()}` : "at current state"}
          </p>
          {failedCount > 0 && (
            <p className="text-[11px] text-ink/70">
              {failedCount.toLocaleString()} stakeOf call(s) failed and were skipped — the
              snapshot is incomplete. Re-run (lower the batch size or try another RPC) before
              using the list.
            </p>
          )}
          <p className="text-[11px] text-ink/50">
            Amount is each account&apos;s staked balance in 27-decimal (RAY) base units —
            usable directly as a pro-rata weight in the grid below.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadCsv("stake-balances.csv", `${csv}\n`)}
              className={`inline-flex items-center gap-1.5 text-sm ${whiteBtnClass("md")}`}
            >
              <Download className="w-3.5 h-3.5" /> Download CSV
            </button>
            <button
              type="button"
              onClick={() => onRows(result)}
              className={`inline-flex items-center gap-2 text-sm ${inkBtnClass("md")}`}
            >
              Load into the list ↓
            </button>
          </div>
        </div>
      )}
    </div>
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
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border-2 text-[11px] font-bold ${
        active ? "border-ink bg-pop-yellow text-ink" : "border-ink/15 bg-white text-ink/50"
      }`}
    >
      <span
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-mono ${
          done ? "bg-ink text-white" : active ? "bg-ink/20 text-ink" : "bg-ink/10 text-ink/50"
        }`}
      >
        {done ? "✓" : n}
      </span>
      {label}
    </span>
  );
}
