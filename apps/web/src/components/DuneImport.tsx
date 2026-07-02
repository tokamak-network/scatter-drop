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

// Parameterized template queries — operators fork one, set the params, and Run.
// Each returns `address` + `balance` columns, which the server normalizes to
// {address, amount}. Aggregation differs per standard:
//  - ERC-20:   sum Transfer `value` deltas (received − sent).
//  - ERC-721:  no value; the last Transfer `to` per tokenId is the owner, then
//              count tokenIds per owner.
//  - ERC-1155: sum TransferSingle + (unnested) TransferBatch deltas for one id.
// The HAVING uses `>= {{min_balance}}`; with min 0 the operator changes it to
// `>` to drop fully-exited (zero-balance) holders (see the guide note).
type Standard = "erc20" | "erc721" | "erc1155";

const TEMPLATES: Record<Standard, string> = {
  erc20: `WITH flows AS (
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
HAVING SUM(delta) >= {{min_balance}}
   AND holder != 0x0000000000000000000000000000000000000000
ORDER BY balance DESC`,

  erc721: `WITH owner AS (
    SELECT "tokenId",
           "to" AS holder,
           ROW_NUMBER() OVER (PARTITION BY "tokenId"
                              ORDER BY evt_block_number DESC, evt_index DESC) AS rn
    FROM erc721_ethereum.evt_Transfer
    WHERE contract_address = {{collection}}
      AND evt_block_number <= {{snapshot_block}}
)
SELECT holder AS address, COUNT(*) AS balance
FROM owner
WHERE rn = 1
  AND holder != 0x0000000000000000000000000000000000000000
GROUP BY holder
HAVING COUNT(*) >= {{min_count}}
ORDER BY balance DESC`,

  erc1155: `WITH flows AS (
    SELECT "to" AS holder, CAST(value AS int256) AS delta
    FROM erc1155_ethereum.evt_TransferSingle
    WHERE contract_address = {{collection}} AND id = {{token_id}}
      AND evt_block_number <= {{snapshot_block}}
    UNION ALL
    SELECT "from" AS holder, -CAST(value AS int256) AS delta
    FROM erc1155_ethereum.evt_TransferSingle
    WHERE contract_address = {{collection}} AND id = {{token_id}}
      AND evt_block_number <= {{snapshot_block}}
    UNION ALL
    SELECT "to" AS holder, CAST(v AS int256) AS delta
    FROM erc1155_ethereum.evt_TransferBatch
         CROSS JOIN UNNEST(ids, "values") AS t(tid, v)
    WHERE contract_address = {{collection}} AND tid = {{token_id}}
      AND evt_block_number <= {{snapshot_block}}
    UNION ALL
    SELECT "from" AS holder, -CAST(v AS int256) AS delta
    FROM erc1155_ethereum.evt_TransferBatch
         CROSS JOIN UNNEST(ids, "values") AS t(tid, v)
    WHERE contract_address = {{collection}} AND tid = {{token_id}}
      AND evt_block_number <= {{snapshot_block}}
)
SELECT holder AS address, SUM(delta) AS balance
FROM flows
GROUP BY holder
HAVING SUM(delta) >= {{min_balance}}
   AND holder != 0x0000000000000000000000000000000000000000
ORDER BY balance DESC`,
};

// `params` lists the {{…}} placeholders in each template and what to replace
// them with — addresses go in as bare 0x… (no quotes), numbers as-is.
const STANDARDS: {
  id: Standard;
  hint: string;
  table: string;
  params: { ph: string; desc: string }[];
}[] = [
  {
    id: "erc20",
    hint: "Balance = summed token amount (base units).",
    table: "erc20_ethereum",
    params: [
      { ph: "{{token}}", desc: "ERC-20 token contract address, e.g. 0xA0b8… (bare, no quotes)" },
      { ph: "{{snapshot_block}}", desc: "block number to snapshot at (a recent block ≈ now)" },
      { ph: "{{min_balance}}", desc: "minimum balance in base units — 0 = every holder" },
    ],
  },
  {
    id: "erc721",
    hint: "Balance = number of NFTs owned at the block.",
    table: "erc721_ethereum",
    params: [
      { ph: "{{collection}}", desc: "NFT collection contract address (0x…)" },
      { ph: "{{snapshot_block}}", desc: "block number to snapshot at" },
      { ph: "{{min_count}}", desc: "minimum NFTs owned — 1 = any holder" },
    ],
  },
  {
    id: "erc1155",
    hint: "Set the token id; balance = amount of that id held.",
    table: "erc1155_ethereum",
    params: [
      { ph: "{{collection}}", desc: "collection contract address (0x…)" },
      { ph: "{{token_id}}", desc: "the token id to snapshot" },
      { ph: "{{snapshot_block}}", desc: "block number to snapshot at" },
      { ph: "{{min_balance}}", desc: "minimum amount of that id held — 0 = every holder" },
    ],
  },
];

export type Recipient = { address: string; amount: string };

type FetchResult = { rows: Recipient[]; truncated: boolean };

export function DuneImport({ onRows }: { onRows: (rows: Recipient[]) => void }) {
  // Two-level source picker (mirrors the Snapshot tab): ERC-20 holders, or NFT
  // holders → ERC-721 / ERC-1155.
  const [category, setCategory] = useState<"erc20" | "nft">("erc20");
  const [nftStd, setNftStd] = useState<"erc721" | "erc1155">("erc721");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FetchResult | null>(null);
  const [copied, setCopied] = useState(false);

  const std: Standard = category === "erc20" ? "erc20" : nftStd;
  const meta = STANDARDS.find((s) => s.id === std)!;
  const sql = TEMPLATES[std];

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
    navigator.clipboard?.writeText(sql);
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

      {/* Which kind of holder to aggregate — ERC-20 vs NFT (→ 721 / 1155) */}
      <div className="flex flex-wrap gap-2">
        <PickBtn active={category === "erc20"} onClick={() => setCategory("erc20")}>
          ERC-20 holders
        </PickBtn>
        <PickBtn active={category === "nft"} onClick={() => setCategory("nft")}>
          NFT holders
        </PickBtn>
      </div>
      {category === "nft" && (
        <div className="flex flex-wrap gap-2">
          <PickBtn active={nftStd === "erc721"} onClick={() => setNftStd("erc721")}>
            ERC-721
          </PickBtn>
          <PickBtn active={nftStd === "erc1155"} onClick={() => setNftStd("erc1155")}>
            ERC-1155
          </PickBtn>
        </div>
      )}
      <p className="text-[11px] text-slate-500">{meta.hint}</p>

      {/* Step-by-step guide */}
      <details className="rounded-lg border border-slate-800 bg-slate-950 open:pb-3">
        <summary className="cursor-pointer px-4 py-2.5 text-xs font-mono font-semibold text-slate-200 select-none">
          How to run the query on Dune ▾
        </summary>
        <ol className="mt-1 space-y-1.5 px-4 text-[11px] text-slate-400 list-decimal list-inside">
          <li>
            Log in at{" "}
            <a href="https://dune.com/" target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline">
              dune.com
            </a>
            .
          </li>
          <li>
            Create a new query at{" "}
            <span className="font-mono text-slate-200">
              dune.com/workspace/u/&lt;your-id&gt;/queries
            </span>
            .
          </li>
          <li>Paste the SQL below into the query editor, then replace the placeholders (listed under it).</li>
          <li>
            Click <span className="font-mono text-slate-200">Run</span>. Below the results, click the{" "}
            <span className="font-mono text-slate-200">API</span> icon →{" "}
            <span className="font-mono text-slate-200">Preview API</span> — a new tab opens with the
            results URL (it includes your api_key).
          </li>
          <li>Copy that URL, paste it below, and fetch.</li>
        </ol>

        <div className="mx-4 mt-2 relative">
          <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900 p-3 text-[10.5px] leading-relaxed font-mono text-slate-300">
            {sql}
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
        {/* Which placeholders to replace, for the selected standard */}
        <div className="mx-4 mt-2">
          <p className="text-[10.5px] font-semibold text-slate-300">Replace in the query:</p>
          <ul className="mt-1 space-y-0.5 text-[10.5px] text-slate-400">
            {meta.params.map((p) => (
              <li key={p.ph}>
                <span className="font-mono text-emerald-600">{p.ph}</span> — {p.desc}
              </li>
            ))}
          </ul>
        </div>
        {meta.id !== "erc721" && (
          <p className="mt-2 px-4 text-[10.5px] text-amber-600">
            If min balance is <span className="font-mono">0</span> (everyone), change{" "}
            <span className="font-mono">SUM(delta) &gt;=</span> to{" "}
            <span className="font-mono">SUM(delta) &gt;</span> so zero-balance (fully-exited) holders
            are dropped.
          </p>
        )}
        <p className="mt-2 px-4 text-[10.5px] text-slate-500">
          Template targets Ethereum mainnet (<span className="font-mono">{meta.table}</span>). For
          another chain, swap the table suffix (e.g. <span className="font-mono">_base</span>).
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

function PickBtn({
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
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
        active
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
          : "border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
