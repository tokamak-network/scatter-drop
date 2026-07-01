"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "viem";
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";

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

export default function ToolsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([{ ...BLANK }]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [equalAmount, setEqualAmount] = useState("");

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
      const addrOk = isAddress(r.address.trim());
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
  icon: React.ReactNode;
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
