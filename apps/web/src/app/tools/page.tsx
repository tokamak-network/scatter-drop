"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "viem";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Download,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { DuneImport, type Recipient } from "@/components/DuneImport";
import { downloadCsv } from "@/lib/downloadCsv";
import { DRAFT_CSV_KEY } from "@/lib/draftCsv";

type Row = Recipient;
const BLANK: Row = { address: "", amount: "" };
// Amounts must be non-negative base-10 integers — matches the SDK/merkle CSV
// parser (packages/merkle/src/csv.ts), so /tools can't accept hex/signed values
// that the create wizard would later reject.
const DEC = /^\d+$/;
function isPosAmount(s: string): boolean {
  const t = s.trim();
  if (!DEC.test(t)) return false;
  try {
    return BigInt(t) > 0n;
  } catch {
    return false;
  }
}

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
      // Strip wrapping quotes (Excel/CSV exports) so validation/BigInt don't fail.
      const address = (a ?? "").trim().replace(/^["']|["']$/g, "");
      const amount = (b ?? "").trim().replace(/^["']|["']$/g, "");
      return { address, amount };
    })
    .filter((r) => !/^address$/i.test(r.address));
  return rows.length ? rows : [{ ...BLANK }];
}

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
    // Only base-10 amounts count toward the sum (hex/signed/garbage → 0).
    const t = r.amount.trim();
    const amt = DEC.test(t) ? BigInt(t) : 0n;
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
  const [step, setStep] = useState<1 | 2>(1);
  // Step 1 works on CSV text (paste / upload / Dune fill it); step 2 works on the
  // parsed rows. They sync at each transition so edits in either survive.
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<Row[]>([{ ...BLANK }]);
  const [copied, setCopied] = useState(false);
  const [equalAmount, setEqualAmount] = useState("");
  const [proRataTotal, setProRataTotal] = useState("");
  const [capInput, setCapInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const setAndPad = (next: Row[]) => setRows(withTrailingBlank(next));

  const update = (i: number, key: keyof Row, val: string) =>
    setAndPad(rows.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));

  const removeRow = (i: number) => {
    const next = rows.filter((_, idx) => idx !== i);
    setRows(next.length ? withTrailingBlank(next) : [{ ...BLANK }]);
  };

  // Append CSV text (from a Dune fetch, a file, or a paste) to whatever is
  // already in the step-1 CSV box, so multiple sources aggregate into one list.
  const appendCsv = (text: string) => {
    const add = text.trim();
    if (!add) return;
    setCsvText((prev) => (prev.trim() ? `${prev.trim()}\n${add}` : add));
  };
  const appendRecipients = (recipients: Recipient[]) =>
    appendCsv(recipients.map((r) => `${r.address},${r.amount}`).join("\n"));

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => appendCsv(String(reader.result ?? ""));
    reader.readAsText(file);
    e.target.value = "";
  };

  // How many valid recipients the step-1 CSV currently parses to.
  const parsedCount = useMemo(
    () =>
      csvToRows(csvText).filter(
        (r) => isAddress(r.address.trim(), { strict: false }),
      ).length,
    [csvText],
  );

  const goToAmounts = () => {
    if (parsedCount === 0) return;
    setAndPad(csvToRows(csvText));
    setStep(2);
  };
  const backToAggregate = () => {
    setCsvText(rowsToCsv(rows));
    setStep(1);
  };

  const applyEqual = () => {
    const v = equalAmount.trim();
    if (!isPosAmount(v)) return; // positive base-10 integer only
    setAndPad(rows.map((r) => (r.address.trim() ? { ...r, amount: v } : r)));
  };

  // Split a fixed total across recipients weighted by their current amount
  // (e.g. the Dune balance). Uses floor per recipient, then gives the rounding
  // remainder to the largest-weight recipient so the sum equals the total exactly.
  const applyProRata = () => {
    const t = proRataTotal.trim();
    if (!isPosAmount(t)) return;
    const total = BigInt(t);
    const weights = rows.map((r) =>
      r.address.trim() && isPosAmount(r.amount) ? BigInt(r.amount.trim()) : 0n,
    );
    const sum = weights.reduce((a, b) => a + b, 0n);
    if (sum === 0n) return; // nothing to weight by
    let assigned = 0n;
    let maxIdx = -1;
    let maxW = 0n;
    const next = rows.map((r, i) => {
      const w = weights[i];
      if (w > maxW) {
        maxW = w;
        maxIdx = i;
      }
      if (w === 0n) return r.address.trim() ? { ...r, amount: "0" } : r;
      const amt = (total * w) / sum;
      assigned += amt;
      return { ...r, amount: amt.toString() };
    });
    const remainder = total - assigned;
    if (remainder > 0n && maxIdx >= 0) {
      next[maxIdx] = {
        ...next[maxIdx],
        amount: (BigInt(next[maxIdx].amount || "0") + remainder).toString(),
      };
    }
    setAndPad(next);
  };

  const doDedup = () => setAndPad(dedupSum(rows.filter(nonEmpty)));
  const doCap = () => {
    if (!isPosAmount(capInput)) return; // positive base-10 integer only
    const cap = BigInt(capInput.trim());
    setAndPad(
      rows.map((r) =>
        isPosAmount(r.amount) && BigInt(r.amount.trim()) > cap
          ? { ...r, amount: cap.toString() }
          : r,
      ),
    );
  };

  const onPaste = (e: React.ClipboardEvent, i: number) => {
    const text = e.clipboardData.getData("text");
    if (!/[\n,\t]/.test(text)) return;
    e.preventDefault();
    // Preserve rows both before and after the paste point (no data loss).
    const before = rows.slice(0, i).filter(nonEmpty);
    const after = rows.slice(i + 1).filter(nonEmpty);
    setAndPad([...before, ...csvToRows(text), ...after]);
  };

  const analysis = useMemo(() => {
    const seen = new Set<string>();
    let total = 0n;
    let valid = 0;
    const status = rows.map((r) => {
      if (!nonEmpty(r)) return { state: "blank" as const };
      const addrOk = isAddress(r.address.trim(), { strict: false });
      const amtOk = isPosAmount(r.amount);
      const amt = amtOk ? BigInt(r.amount.trim()) : 0n;
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
  const hasValid = analysis.valid > 0;
  // Export/Copy/Use serialize ALL rows, so block them while any row is invalid —
  // a stray bad row would otherwise produce a CSV the wizard rejects.
  const canUse = hasValid && analysis.invalid === 0;

  const download = () => downloadCsv("scatter-drop-recipients.csv", `${rowsToCsv(rows)}\n`);
  const copyCsv = () => {
    navigator.clipboard?.writeText(rowsToCsv(rows));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  const useInCampaign = () => {
    try {
      localStorage.setItem(DRAFT_CSV_KEY, rowsToCsv(rows));
    } catch {
      /* ignore */
    }
    router.push("/manage/new");
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-emerald-600">
          Tools
        </span>
        <h1 className="mt-1 text-2xl font-bold text-slate-50 tracking-tight">
          Recipient list builder
        </h1>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          Two steps: aggregate the recipients from a Dune query, then decide how
          much each one gets. Amounts are in base units (wei-like, no 18-decimal
          scaling).
        </p>
      </div>

      {/* Wizard step indicator */}
      <div className="flex items-center gap-2">
        <StepPill
          n={1}
          label="Aggregate recipients"
          active={step === 1}
          onClick={() => step === 2 && backToAggregate()}
        />
        <span className="h-px w-6 bg-slate-800" />
        <StepPill
          n={2}
          label="Decide amounts"
          active={step === 2}
          disabled={step === 1 && parsedCount === 0}
          onClick={() => step === 1 && goToAmounts()}
        />
      </div>

      {step === 1 && (
        <div className="space-y-4">
          {/* Source: Dune query → fills the CSV below */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <DuneImport onRows={appendRecipients} />
          </div>

          {/* Source: upload / paste / hand-edit — the shared recipient CSV */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-slate-100 mr-auto">Recipient CSV</h2>
              <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} />
              <ToolbarBtn onClick={() => fileRef.current?.click()} icon={<Upload className="w-3.5 h-3.5" />}>
                Upload CSV
              </ToolbarBtn>
              <ToolbarBtn onClick={() => setCsvText("")} disabled={!csvText.trim()}>
                Clear
              </ToolbarBtn>
            </div>
            <p className="text-[11px] text-slate-500">
              One <span className="font-mono">address,amount</span> per line. A Dune fetch above
              appends its holders here; you can also paste or type directly.
            </p>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={10}
              spellCheck={false}
              placeholder={"0xabc…,1000000000000000000\n0xdef…,500000000000000000"}
              className="input font-mono text-xs"
            />
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-mono">
                {parsedCount.toLocaleString()} recipient(s)
              </span>
              <button
                onClick={goToAmounts}
                disabled={parsedCount === 0}
                className="ml-auto inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm transition"
              >
                Next: decide amounts <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          {/* Amount tools */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
            <p className="text-xs text-slate-400">
              Set amounts across the list, or edit any cell directly below.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400 text-xs font-mono">Equal / wallet:</span>
              <ValueInput value={equalAmount} onChange={setEqualAmount} placeholder="amount" />
              <ToolbarBtn onClick={applyEqual} icon={<Check className="w-3.5 h-3.5" />} disabled={!equalAmount.trim()}>
                Set each
              </ToolbarBtn>
              <span className="mx-1 h-4 w-px bg-slate-800" />
              <span className="text-slate-400 text-xs font-mono">Pro-rata total:</span>
              <ValueInput value={proRataTotal} onChange={setProRataTotal} placeholder="total" />
              <ToolbarBtn onClick={applyProRata} disabled={!proRataTotal.trim()}>
                Split by balance
              </ToolbarBtn>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-800/60 pt-3">
              <span className="text-slate-400 text-xs font-mono">Cap per wallet:</span>
              <ValueInput value={capInput} onChange={setCapInput} placeholder="max" />
              <ToolbarBtn onClick={doCap} disabled={!capInput.trim()}>Apply cap</ToolbarBtn>
              <span className="mx-1 h-4 w-px bg-slate-800" />
              <ToolbarBtn onClick={doDedup}>Dedupe (sum amounts)</ToolbarBtn>
              <ToolbarBtn onClick={() => setAndPad([...rows.filter(nonEmpty), { ...BLANK }])} icon={<Plus className="w-3.5 h-3.5" />}>
                Add row
              </ToolbarBtn>
            </div>
          </div>

          {/* The working list */}
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-slate-100 mr-auto">
              Your list
              <span className="ml-2 text-xs font-normal text-slate-400">
                {analysis.valid.toLocaleString()} recipients · total {analysis.total.toLocaleString()}
                {analysis.invalid > 0 && (
                  <span className="text-amber-600"> · {analysis.invalid} error(s)</span>
                )}
              </span>
            </h2>
            <ToolbarBtn onClick={backToAggregate} icon={<ArrowLeft className="w-3.5 h-3.5" />}>
              Re-aggregate
            </ToolbarBtn>
            <ToolbarBtn onClick={download} icon={<Download className="w-3.5 h-3.5" />} disabled={!canUse}>
              Export CSV
            </ToolbarBtn>
            <ToolbarBtn onClick={copyCsv} icon={copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />} disabled={!canUse}>
              {copied ? "Copied" : "Copy"}
            </ToolbarBtn>
            <button
              onClick={useInCampaign}
              disabled={!canUse}
              className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm transition"
            >
              Use in a campaign <ArrowRight className="w-4 h-4" />
            </button>
          </div>

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
                      <td className="px-3 py-1 text-right font-mono text-[11px] text-slate-500">{i + 1}</td>
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
                          <button onClick={() => removeRow(i)} className="text-slate-500 hover:text-red-500 transition" title="Remove row">
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
          {analysis.invalid > 0 && (
            <p className="text-[11px] text-amber-600">
              Rows in red have an invalid address, a non-positive amount, or a duplicate address.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StepPill({
  n,
  label,
  active,
  disabled,
  onClick,
}: {
  n: number;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
          : "border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700"
      }`}
    >
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-mono ${
          active ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-300"
        }`}
      >
        {n}
      </span>
      {label}
    </button>
  );
}

function ValueInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-slate-950 border border-slate-800 focus:border-slate-700 text-slate-100 px-3 py-1.5 rounded-lg font-mono text-xs outline-none w-40"
    />
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
      className="inline-flex items-center gap-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 disabled:opacity-50 text-slate-100 text-xs font-semibold px-3 py-2 rounded-lg transition"
    >
      {icon}
      {children}
    </button>
  );
}
