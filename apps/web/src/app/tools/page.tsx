"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "viem";
import {
  ArrowRight,
  Camera,
  Check,
  Copy,
  Download,
  Layers,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { SnapshotBuilder } from "@/components/SnapshotBuilder";
import type { SnapshotManifest } from "@/lib/useSnapshotJob";

type Row = { address: string; amount: string };
const BLANK: Row = { address: "", amount: "" };
const DRAFT_KEY = "scatterdrop:draft-csv";

function nonEmpty(r: Row) {
  return r.address.trim() !== "" || r.amount.trim() !== "";
}

function rowsToCsv(rows: Row[]): string {
  return rows
    .filter(nonEmpty)
    .map((r) => `${r.address.trim()},${r.amount.trim()}`)
    .join("\n");
}

function csvToRows(text: string): Row[] {
  const rows = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [a, b] = line.split(/[,\t]/);
      return { address: (a ?? "").trim(), amount: (b ?? "").trim() };
    })
    // drop a header row like "address,amount"
    .filter((r) => !/^address$/i.test(r.address));
  return rows.length ? rows : [{ ...BLANK }];
}

/** Keep exactly one trailing blank row so the grid always has an empty line to type into. */
function withTrailingBlank(rows: Row[]): Row[] {
  const last = rows[rows.length - 1];
  if (!last || nonEmpty(last)) return [...rows, { ...BLANK }];
  return rows;
}

/** Merge duplicate addresses, summing amounts; preserves first-seen order and casing. */
function dedupSum(rows: Row[]): Row[] {
  const totals = new Map<string, bigint>();
  const display = new Map<string, string>();
  const order: string[] = [];
  for (const r of rows) {
    const a = r.address.trim();
    if (!isAddress(a, { strict: false })) continue;
    const key = a.toLowerCase();
    let amt = 0n;
    try {
      amt = BigInt(r.amount.trim() || "0");
    } catch {
      amt = 0n;
    }
    if (!totals.has(key)) {
      totals.set(key, 0n);
      display.set(key, a);
      order.push(key);
    }
    totals.set(key, (totals.get(key) as bigint) + amt);
  }
  return order.map((key) => ({
    address: display.get(key) as string,
    amount: (totals.get(key) as bigint).toString(),
  }));
}

export default function ToolsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([{ ...BLANK }]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [equalAmount, setEqualAmount] = useState("");
  const [snap, setSnap] = useState<SnapshotManifest | null>(null);

  const loadSnapshot = () => {
    if (!snap) return;
    setAndPad(
      Object.values(snap.claims).map((c) => ({
        address: c.account,
        amount: c.amount,
      })),
    );
  };

  // Combine & filter (P3, §5.2) — all pure client-side set/amount ops.
  const [operand, setOperand] = useState(""); // second list for AND/OR/exclude
  const [capInput, setCapInput] = useState("");

  const operandKeys = useMemo(() => {
    const s = new Set<string>();
    for (const r of csvToRows(operand)) {
      const a = r.address.trim();
      if (isAddress(a, { strict: false })) s.add(a.toLowerCase());
    }
    return s;
  }, [operand]);
  const hasOperand = operandKeys.size > 0;
  const keyOf = (r: Row) => r.address.trim().toLowerCase();

  const doIntersect = () =>
    setAndPad(rows.filter((r) => nonEmpty(r) && operandKeys.has(keyOf(r))));
  const doExclude = () =>
    setAndPad(rows.filter((r) => nonEmpty(r) && !operandKeys.has(keyOf(r))));
  const doUnion = () =>
    setAndPad(dedupSum([...rows.filter(nonEmpty), ...csvToRows(operand)]));
  const doDedup = () => setAndPad(dedupSum(rows.filter(nonEmpty)));
  const doCap = () => {
    let cap: bigint;
    try {
      cap = BigInt(capInput.trim());
    } catch {
      return;
    }
    setAndPad(
      rows.map((r) => {
        try {
          return BigInt(r.amount.trim() || "0") > cap
            ? { ...r, amount: cap.toString() }
            : r;
        } catch {
          return r;
        }
      }),
    );
  };

  const setAndPad = (next: Row[]) => setRows(withTrailingBlank(next));

  const update = (i: number, key: keyof Row, val: string) =>
    setAndPad(rows.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));

  const removeRow = (i: number) => {
    const next = rows.filter((_, idx) => idx !== i);
    setRows(next.length ? withTrailingBlank(next) : [{ ...BLANK }]);
  };

  // §5.1 in-app builder helper: "N recipients, equal X each" — set every
  // address row's amount to the same value.
  const applyEqual = () => {
    const v = equalAmount.trim();
    if (!v) return;
    setAndPad(rows.map((r) => (r.address.trim() ? { ...r, amount: v } : r)));
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAndPad(csvToRows(String(reader.result ?? "")));
    reader.readAsText(file);
    e.target.value = "";
  };

  // Paste CSV/TSV (address,amount per line) into a cell → bulk-fill from that row.
  const onPaste = (e: React.ClipboardEvent, i: number) => {
    const text = e.clipboardData.getData("text");
    if (!/[\n,\t]/.test(text)) return; // single value → let the input handle it
    e.preventDefault();
    const kept = rows.slice(0, i).filter(nonEmpty);
    setAndPad([...kept, ...csvToRows(text)]);
  };

  const analysis = useMemo(() => {
    const seen = new Set<string>();
    let total = 0n;
    let valid = 0;
    const status = rows.map((r) => {
      if (!nonEmpty(r)) return { state: "blank" as const };
      const addrOk = isAddress(r.address.trim(), { strict: false });
      let amt = 0n;
      let amtOk = false;
      try {
        amt = BigInt(r.amount.trim());
        amtOk = amt > 0n;
      } catch {
        amtOk = false;
      }
      const key = r.address.trim().toLowerCase();
      const dup = addrOk && seen.has(key);
      if (addrOk) seen.add(key);
      const ok = addrOk && amtOk && !dup;
      if (ok) {
        valid += 1;
        total += amt;
      }
      return { state: ok ? ("ok" as const) : ("bad" as const), addrOk, amtOk, dup };
    });
    const filled = status.filter((s) => s.state !== "blank").length;
    return { status, total, valid, invalid: filled - valid };
  }, [rows]);

  const download = () => {
    const blob = new Blob([`${rowsToCsv(rows)}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scatter-drop-recipients.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyCsv = () => {
    navigator.clipboard?.writeText(rowsToCsv(rows));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const useInCampaign = () => {
    try {
      localStorage.setItem(DRAFT_KEY, rowsToCsv(rows));
    } catch {
      /* ignore */
    }
    router.push("/manage/new");
  };

  const hasValid = analysis.valid > 0;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-emerald-600">
          Tools
        </span>
        <h1 className="mt-1 text-2xl font-bold text-slate-50 tracking-tight">
          CSV list builder
        </h1>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          Build a recipient list right here — edit like a spreadsheet, paste or
          import a CSV, then export it or send it straight to a new campaign.
          Amounts are in base units (wei-like, no 18-decimal scaling).
        </p>
      </div>

      {/* Snapshot generator (reuses the /api/snapshot RPC-scan backend) */}
      <details className="rounded-xl border border-slate-800 bg-slate-900 group">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-100 flex items-center gap-2">
          <Camera className="w-4 h-4 text-emerald-600" />
          Generate from an on-chain snapshot (ERC-20 holders)
        </summary>
        <div className="px-4 pb-4 space-y-3 border-t border-slate-800/60 pt-3">
          <SnapshotBuilder onResult={setSnap} />
          {snap && (
            <button
              onClick={loadSnapshot}
              className="w-full inline-flex items-center justify-center gap-2 bg-slate-950 border border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-600 font-semibold px-4 py-2 rounded-lg text-sm transition"
            >
              Load {snap.count.toLocaleString()} holders into the grid ↓
            </button>
          )}
        </div>
      </details>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={onFile}
        />
        <ToolbarBtn onClick={() => fileRef.current?.click()} icon={<Upload className="w-3.5 h-3.5" />}>
          Import CSV
        </ToolbarBtn>
        <ToolbarBtn onClick={() => setAndPad([...rows.filter(nonEmpty), { ...BLANK }])} icon={<Plus className="w-3.5 h-3.5" />}>
          Add row
        </ToolbarBtn>
        <ToolbarBtn onClick={download} icon={<Download className="w-3.5 h-3.5" />} disabled={!hasValid}>
          Export CSV
        </ToolbarBtn>
        <ToolbarBtn onClick={copyCsv} icon={copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />} disabled={!hasValid}>
          {copied ? "Copied" : "Copy CSV"}
        </ToolbarBtn>
        <button
          onClick={useInCampaign}
          disabled={!hasValid}
          className="ml-auto inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm transition"
        >
          Use in a campaign <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Equal-split helper (§5.1) */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-400 font-mono">Equal split:</span>
        <input
          value={equalAmount}
          onChange={(e) => setEqualAmount(e.target.value)}
          placeholder="amount (base units)"
          className="bg-slate-950 border border-slate-800 focus:border-slate-700 text-slate-100 px-3 py-1.5 rounded-lg font-mono text-xs outline-none w-56"
        />
        <ToolbarBtn onClick={applyEqual} icon={<Check className="w-3.5 h-3.5" />} disabled={!equalAmount.trim()}>
          Set each address to this
        </ToolbarBtn>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <th className="w-10 px-3 py-2 text-right">#</th>
              <th className="px-3 py-2">Address</th>
              <th className="px-3 py-2 w-64">Amount (base units)</th>
              <th className="w-10 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const s = analysis.status[i];
              const addrBad = s.state === "bad" && s.addrOk === false;
              const amtBad = s.state === "bad" && s.amtOk === false;
              const dup = s.state === "bad" && s.dup;
              return (
                <tr key={i} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-3 py-1 text-right font-mono text-[11px] text-slate-500">
                    {i + 1}
                  </td>
                  <td className="px-1 py-1">
                    <input
                      value={r.address}
                      onChange={(e) => update(i, "address", e.target.value)}
                      onPaste={(e) => onPaste(e, i)}
                      placeholder="0x…"
                      className={`w-full bg-transparent px-2 py-1 rounded font-mono text-xs outline-none focus:bg-slate-950 ${
                        addrBad || dup ? "text-red-500" : "text-slate-100"
                      }`}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      value={r.amount}
                      onChange={(e) => update(i, "amount", e.target.value)}
                      onPaste={(e) => onPaste(e, i)}
                      placeholder="100"
                      className={`w-full bg-transparent px-2 py-1 rounded font-mono text-xs outline-none focus:bg-slate-950 ${
                        amtBad ? "text-red-500" : "text-slate-100"
                      }`}
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    {nonEmpty(r) && (
                      <button
                        onClick={() => removeRow(i)}
                        className="text-slate-500 hover:text-red-500 transition"
                        title="Remove row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-3 text-xs">
        <Stat label="Valid recipients" value={analysis.valid.toLocaleString()} />
        <Stat label="Total amount" value={analysis.total.toLocaleString()} />
        <Stat
          label="Errors"
          value={String(analysis.invalid)}
          bad={analysis.invalid > 0}
        />
      </div>
      {analysis.invalid > 0 && (
        <p className="text-[11px] text-amber-600">
          Rows in red have an invalid address, a non-positive amount, or a
          duplicate address. Fix or remove them before using the list.
        </p>
      )}

      {/* Combine & filter (P3, §5.2) */}
      <details className="rounded-xl border border-slate-800 bg-slate-900">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-100 flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-600" /> Combine &amp; filter
        </summary>
        <div className="px-4 pb-4 space-y-4 border-t border-slate-800/60 pt-3">
          <div>
            <label className="text-[11px] text-slate-400">
              Second list (address[,amount] per line) — for set operations against
              the grid above
            </label>
            <textarea
              value={operand}
              onChange={(e) => setOperand(e.target.value)}
              rows={4}
              placeholder={"0xabc…\n0xdef…,50"}
              className="input font-mono text-xs mt-1"
            />
            <div className="flex flex-wrap gap-2 mt-2">
              <ToolbarBtn onClick={doUnion} disabled={!hasOperand}>
                Union (OR)
              </ToolbarBtn>
              <ToolbarBtn onClick={doIntersect} disabled={!hasOperand}>
                Intersect (AND)
              </ToolbarBtn>
              <ToolbarBtn onClick={doExclude} disabled={!hasOperand}>
                Exclude (remove these)
              </ToolbarBtn>
              <span className="text-[11px] text-slate-500 self-center">
                {hasOperand
                  ? `${operandKeys.size} address(es) in second list`
                  : "paste a second list to enable"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-800/60 pt-3">
            <ToolbarBtn onClick={doDedup}>Dedupe (sum amounts)</ToolbarBtn>
            <span className="text-slate-400 text-xs font-mono ml-2">
              Cap per wallet:
            </span>
            <input
              value={capInput}
              onChange={(e) => setCapInput(e.target.value)}
              placeholder="max (base units)"
              className="bg-slate-950 border border-slate-800 focus:border-slate-700 text-slate-100 px-3 py-1.5 rounded-lg font-mono text-xs outline-none w-44"
            />
            <ToolbarBtn onClick={doCap} disabled={!capInput.trim()}>
              Apply cap
            </ToolbarBtn>
          </div>
        </div>
      </details>
    </div>
  );
}

function ToolbarBtn({
  onClick,
  icon,
  disabled,
  children,
}: {
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-50 text-slate-100 text-xs font-semibold px-3 py-2 rounded-lg transition"
    >
      {icon}
      {children}
    </button>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-900 border border-slate-800 px-4 py-2.5">
      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className={`text-lg font-bold ${bad ? "text-amber-600" : "text-slate-50"}`}>
        {value}
      </div>
    </div>
  );
}
