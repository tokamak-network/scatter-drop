"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isAddress } from "viem";
import { Loader2, Play, RotateCcw } from "lucide-react";
import {
  useSnapshotJob,
  type SnapshotJobInput,
  type SnapshotManifest,
} from "@/lib/useSnapshotJob";

const isUint = (s: string) => /^\d+$/.test(s);

/**
 * SNAP-4 — operator inputs (scan token / block / min balance / equal|proRata)
 * → POST /api/snapshot/start → poll → preview. Lifts the resulting manifest
 * (merkleRoot + totalAmount + count) to the wizard via onResult.
 */
export function SnapshotBuilder({
  onResult,
  standard = "erc20",
}: {
  onResult: (m: SnapshotManifest | null) => void;
  standard?: "erc20" | "erc721" | "erc1155";
}) {
  const { phase, progress, result, error, start, reset } = useSnapshotJob();
  const isNft = standard !== "erc20";
  const is1155 = standard === "erc1155";

  const [token, setToken] = useState("");
  const [block, setBlock] = useState("");
  const [fromBlock, setFromBlock] = useState("");
  const [minBalance, setMinBalance] = useState("0");
  const [tokenId, setTokenId] = useState("");
  const [kind, setKind] = useState<"equal" | "proRata">("equal");
  const [perWallet, setPerWallet] = useState("");
  const [totalAmount, setTotalAmount] = useState("");

  const amountValid =
    kind === "equal"
      ? isUint(perWallet) && BigInt(perWallet || "0") > 0n
      : isUint(totalAmount) && BigInt(totalAmount || "0") > 0n;
  const inputValid =
    isAddress(token) &&
    isUint(block) &&
    BigInt(block || "0") > 0n &&
    (minBalance === "" || isUint(minBalance)) &&
    (fromBlock === "" ||
      (isUint(fromBlock) && BigInt(fromBlock) <= BigInt(block || "0"))) &&
    (!is1155 || isUint(tokenId)) &&
    amountValid;

  // Keep the latest onResult in a ref so the lift effect depends only on the
  // job state, not the callback identity (avoids a re-render loop with an inline
  // parent callback).
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);
  useEffect(() => {
    onResultRef.current(phase === "done" ? result : null);
  }, [phase, result]);

  // If inputs are edited after a finished run, drop the stale manifest so the
  // wizard can't proceed with a root/total that no longer matches the inputs.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  useEffect(() => {
    if (phaseRef.current === "done" || phaseRef.current === "error") reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, block, fromBlock, minBalance, tokenId, standard, kind, perWallet, totalAmount]);

  const topN = useMemo(() => {
    if (!result) return [];
    return Object.values(result.claims)
      .sort((a, b) => {
        const av = BigInt(a.amount);
        const bv = BigInt(b.amount);
        return bv > av ? 1 : bv < av ? -1 : 0;
      })
      .slice(0, 5);
  }, [result]);

  function compute() {
    const mode: SnapshotJobInput["mode"] =
      kind === "equal"
        ? { kind: "equal", perWallet }
        : { kind: "proRata", totalAmount };
    const input: SnapshotJobInput = {
      token,
      block,
      minBalance: minBalance || "0",
      mode,
      ...(fromBlock ? { fromBlock } : {}),
      ...(standard !== "erc20" ? { kind: standard } : {}),
      ...(is1155 ? { tokenId } : {}),
    };
    void start(input);
  }

  const running = phase === "running";

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
      <div className="text-xs font-mono text-slate-300">
        On-chain snapshot — scan{" "}
        {standard === "erc20"
          ? "ERC-20 holders"
          : is1155
            ? "ERC-1155 owners"
            : "ERC-721 owners"}{" "}
        at a block (server-side)
      </div>

      <input
        className="input"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder={
          isNft ? "Collection address 0x…" : "Snapshot token address 0x… (whose holders to scan)"
        }
        disabled={running}
      />
      {token && !isAddress(token) && (
        <span className="text-xs text-red-500">Invalid address.</span>
      )}
      {is1155 && (
        <input
          className="input"
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value)}
          placeholder="Token id (ERC-1155)"
          disabled={running}
        />
      )}

      <div className="grid grid-cols-2 gap-2">
        <input
          className="input"
          value={block}
          onChange={(e) => setBlock(e.target.value)}
          placeholder="Snapshot block #"
          disabled={running}
        />
        <input
          className="input"
          value={fromBlock}
          onChange={(e) => setFromBlock(e.target.value)}
          placeholder="From block (optional, speeds scan)"
          disabled={running}
        />
      </div>

      <input
        className="input"
        value={minBalance}
        onChange={(e) => setMinBalance(e.target.value)}
        placeholder={isNft ? "Min held (count, 0 = any)" : "Min balance (base units, 0 = any)"}
        disabled={running}
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setKind("equal")}
          disabled={running}
          className={`flex-1 px-3 py-2 rounded-lg border text-xs font-mono transition ${
            kind === "equal"
              ? "border-emerald-500 bg-emerald-500/5 text-slate-100"
              : "border-slate-800 bg-slate-950 text-slate-400"
          }`}
        >
          Equal / wallet
        </button>
        <button
          type="button"
          onClick={() => setKind("proRata")}
          disabled={running}
          className={`flex-1 px-3 py-2 rounded-lg border text-xs font-mono transition ${
            kind === "proRata"
              ? "border-emerald-500 bg-emerald-500/5 text-slate-100"
              : "border-slate-800 bg-slate-950 text-slate-400"
          }`}
        >
          Pro-rata (split total)
        </button>
      </div>

      {kind === "equal" ? (
        <input
          className="input"
          value={perWallet}
          onChange={(e) => setPerWallet(e.target.value)}
          placeholder="Amount per wallet (base units)"
          disabled={running}
        />
      ) : (
        <input
          className="input"
          value={totalAmount}
          onChange={(e) => setTotalAmount(e.target.value)}
          placeholder="Total amount to split (base units)"
          disabled={running}
        />
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={compute}
          disabled={!inputValid || running}
          className="btn btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {running ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          {running ? "Computing…" : "Compute list"}
        </button>
        {(phase === "done" || phase === "error") && (
          <button
            type="button"
            onClick={reset}
            className="btn inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
        )}
      </div>

      {running && progress && (
        <p className="text-xs text-slate-500 font-mono">
          {progress.phase === "logs" ? "Scanning Transfer logs" : "Reading balances"}
          : {progress.done}
          {progress.total ? ` / ${progress.total}` : ""}
        </p>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {phase === "done" && result && (
        <div className="space-y-2 border-t border-slate-800 pt-3">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Stat label="Holders" value={result.holderCount.toLocaleString()} />
            <Stat label="Recipients" value={result.count.toLocaleString()} />
            <Stat label="Total (base)" value={result.totalAmount} />
          </div>
          <div className="text-[11px] font-mono text-slate-500">
            Top recipients:
          </div>
          <ul className="text-[11px] font-mono text-slate-400 space-y-0.5">
            {topN.map((c) => (
              <li key={c.account} className="flex justify-between gap-2">
                <span className="truncate">{c.account}</span>
                <span>{c.amount}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-emerald-600">
            List ready — continue to create the campaign with this Merkle root.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800/80 rounded p-2">
      <div className="text-slate-500">{label}</div>
      <div className="text-slate-200 font-mono truncate">{value}</div>
    </div>
  );
}
