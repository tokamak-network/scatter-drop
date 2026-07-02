"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Download, Loader2, Play } from "lucide-react";
import { toCsv } from "@/lib/reports";
import { downloadCsv } from "@/lib/downloadCsv";

/**
 * Dune import — the operator runs a holder-balances query on their own Dune
 * account and pastes the results API URL here. We fetch it (server-side, via
 * /api/dune) into an `address,amount` list, offer a CSV download, and can load
 * it straight into the builder grid. Keeps Dune costs on the operator's own
 * (free) plan — the app never needs a Dune key.
 */

// Parameterized template query — operators fork this, set the params, and Run.
// `SUM(delta) > 0` drops fully-exited holders even when min_balance is 0.
const TEMPLATE_SQL = `WITH flows AS (
    SELECT "to" AS holder, CAST(value AS int256) AS delta
    FROM erc20_ethereum.evt_Transfer
    WHERE contract_address = {{token}}
      AND evt_block_number <= {{snapshot_block}}
    UNION ALL
    SELECT "from" AS holder, -CAST(value AS int256) AS delta
    FROM erc20_ethereum.evt_Transfer
    WHERE contract_address = {{token}}
      AND evt_block_number <= {{snapshot_block}}
)
SELECT holder AS address, SUM(delta) AS balance
FROM flows
GROUP BY holder
HAVING SUM(delta) > 0
   AND SUM(delta) >= {{min_balance}}
   AND holder != 0x0000000000000000000000000000000000000000
ORDER BY balance DESC`;

export type Recipient = { address: string; amount: string };

type FetchResult = { rows: Recipient[]; truncated: boolean };

export function DuneImport({ onRows }: { onRows: (rows: Recipient[]) => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FetchResult | null>(null);
  const [copied, setCopied] = useState(false);

  const csv = useMemo(
    () => (result ? toCsv(["address", "amount"], result.rows.map((r) => [r.address, r.amount])) : ""),
    [result],
  );

  async function fetchList() {
    setLoading(true);
    setError(null);
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
      if (rows.length === 0) throw new Error("No holder rows in that result.");
      setResult({ rows, truncated: Boolean(data.truncated) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  function copySql() {
    navigator.clipboard?.writeText(TEMPLATE_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate-500">
        Run a holder-balance query on your own{" "}
        <a
          href="https://dune.com"
          target="_blank"
          rel="noreferrer"
          className="text-emerald-600 hover:underline"
        >
          Dune
        </a>{" "}
        account, then paste the results API URL — Dune aggregates millions of
        transfers in seconds, so this scales where an on-chain scan can&apos;t.
      </p>

      {/* Step-by-step guide */}
      <details className="rounded-lg border border-slate-800 bg-slate-950 open:pb-3">
        <summary className="cursor-pointer px-4 py-2.5 text-xs font-mono font-semibold text-slate-200 select-none">
          How to run the query on Dune ▾
        </summary>
        <ol className="mt-1 space-y-1.5 px-4 text-[11px] text-slate-400 list-decimal list-inside">
          <li>Create a free account at dune.com and open a new query.</li>
          <li>Paste the SQL below and set the token, snapshot block, and min balance.</li>
          <li>
            Click <span className="font-mono text-slate-200">Run</span>, then{" "}
            <span className="font-mono text-slate-200">…&nbsp;→ Get API endpoint</span> and copy
            the <span className="font-mono text-slate-200">results</span> URL (it includes your
            api_key).
          </li>
          <li>Paste that URL below and fetch.</li>
        </ol>

        <div className="mx-4 mt-2 relative">
          <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900 p-3 text-[10.5px] leading-relaxed font-mono text-slate-300">
            {TEMPLATE_SQL}
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
          Template targets Ethereum mainnet (<span className="font-mono">erc20_ethereum</span>). For
          another chain, swap the table (e.g. <span className="font-mono">erc20_base</span>).
        </p>
      </details>

      <div>
        <label className="text-[11px] text-slate-400">Dune results API URL</label>
        <input
          className="input mt-1 font-mono text-xs"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://api.dune.com/api/v1/query/…/results?api_key=…"
          disabled={loading}
          spellCheck={false}
        />
      </div>

      <button
        type="button"
        onClick={fetchList}
        disabled={loading || url.trim() === ""}
        className="btn btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
        {loading ? "Fetching…" : "Fetch list"}
      </button>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {result && (
        <div className="space-y-2 border-t border-slate-800 pt-3">
          <p className="text-xs text-slate-300 font-mono">
            {result.rows.length.toLocaleString()} holders fetched
            {result.truncated && (
              <span className="text-amber-600"> · capped at 100k — narrow the query</span>
            )}
          </p>
          <p className="text-[11px] text-slate-500">
            Amount is each holder&apos;s balance (base units). Download the CSV, or load it into the
            grid below to adjust with Equal-split / Cap.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadCsv("dune-recipients.csv", `${csv}\n`)}
              className="btn inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Download CSV
            </button>
            <button
              type="button"
              onClick={() => onRows(result.rows)}
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
