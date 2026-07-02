"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatUnits, isAddress, parseUnits } from "viem";
import { ArrowLeft, ArrowRight, Check, Copy, Download, Trash2, Upload } from "lucide-react";
import { DuneImport, type Recipient } from "@/components/DuneImport";
import { useErc20Decimals, useErc20Symbol } from "@/lib/contracts";
import { isPositiveDecimal } from "@/lib/validation";
import { downloadCsv } from "@/lib/downloadCsv";
import { DRAFT_CSV_KEY } from "@/lib/draftCsv";

type Row = Recipient;
const BLANK: Row = { address: "", amount: "" };
const DEC = /^\d+$/;
// Cap how many rows the step-2 grid renders (totals/export still cover all).
const RENDER_CAP = 500;

function nonEmpty(r: Row) {
  return r.address.trim() !== "" || r.amount.trim() !== "";
}

/** Integer square root (Newton's method) — for √balance pro-rata weighting. */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n < 0n ? 0n : n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
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

/** Merge duplicate addresses, summing balances; preserves first-seen order/casing. */
function dedupSum(rows: Row[]): Row[] {
  const totals = new Map<string, bigint>();
  const display = new Map<string, string>();
  const order: string[] = [];
  for (const r of rows) {
    const a = r.address.trim();
    if (!isAddress(a, { strict: false })) continue;
    const key = a.toLowerCase();
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
  // Step 1 works on CSV text (paste / upload / Dune fill it); step 2 on the rows.
  const [csvText, setCsvText] = useState("");
  const [view, setView] = useState<"csv" | "table">("csv");
  const [rows, setRows] = useState<Row[]>([{ ...BLANK }]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 2 — airdrop token (for decimals/symbol) + distribution method.
  const [token, setToken] = useState("");
  const [distMode, setDistMode] = useState<"equal" | "prorata" | "sqrt">("equal");
  const [perWallet, setPerWallet] = useState("");
  const [totalDistribute, setTotalDistribute] = useState("");
  const [capValue, setCapValue] = useState("");
  const [includeBalance, setIncludeBalance] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const setAndPad = (next: Row[]) => setRows(withTrailingBlank(next));

  // --- step 1: aggregate ---
  const loadRecipients = (recipients: Recipient[]) =>
    setCsvText(recipients.map((r) => `${r.address},${r.amount}`).join("\n"));

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? "").trim());
    reader.readAsText(file);
    e.target.value = "";
  };

  const parsedRows = useMemo(() => csvToRows(csvText), [csvText]);
  const parsedCount = useMemo(
    () => parsedRows.filter((r) => isAddress(r.address.trim(), { strict: false })).length,
    [parsedRows],
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

  // --- step 2: token metadata (decimals/symbol from the connected chain) ---
  const tokenTrimmed = token.trim();
  const tokenOk = isAddress(tokenTrimmed, { strict: false });
  const tokenAddr = tokenOk ? (tokenTrimmed as `0x${string}`) : undefined;
  const { data: decData } = useErc20Decimals(tokenAddr);
  const { data: symData } = useErc20Symbol(tokenAddr);
  const dec = tokenOk && decData != null ? Number(decData) : null;
  const symbol = typeof symData === "string" && symData ? symData : undefined;
  const unit = dec !== null ? symbol ?? "tokens" : "base units";

  // Parse an input in the active unit (whole tokens when decimals known, else
  // raw base units) to base units. Returns null on empty/invalid.
  const toBase = (v: string): bigint | null => {
    const t = v.trim();
    if (!t) return null;
    if (dec === null) {
      if (!DEC.test(t)) return null;
      try {
        const b = BigInt(t);
        return b > 0n ? b : null;
      } catch {
        return null;
      }
    }
    if (!isPositiveDecimal(t, dec)) return null;
    try {
      const b = parseUnits(t, dec);
      return b > 0n ? b : null;
    } catch {
      return null;
    }
  };

  const perWalletBase = distMode === "equal" ? toBase(perWallet) : null;
  const totalBase = distMode !== "equal" ? toBase(totalDistribute) : null;
  // Cap only applies to the pro-rata methods (meaningless when all wallets are equal).
  const capActive = distMode !== "equal" && capValue.trim() !== "";
  const capBase = capActive ? toBase(capValue) : null;
  const capInvalid = capActive && capBase === null;

  // Compute the airdrop amount (base units) per row, aligned to `rows`.
  const dist = useMemo(() => {
    const airdrops: (bigint | null)[] = rows.map(() => null);
    const valid: number[] = [];
    rows.forEach((r, i) => {
      if (isAddress(r.address.trim(), { strict: false })) valid.push(i);
    });

    if (distMode === "equal" && perWalletBase !== null) {
      for (const i of valid) {
        airdrops[i] = capBase !== null && perWalletBase > capBase ? capBase : perWalletBase;
      }
    } else if (totalBase !== null) {
      // prorata: weight by balance; sqrt: weight by √balance (dampens whales).
      const weights = valid.map((i) => {
        const b = DEC.test(rows[i].amount.trim()) ? BigInt(rows[i].amount.trim()) : 0n;
        return distMode === "sqrt" ? isqrt(b) : b;
      });
      const sumW = weights.reduce((a, b) => a + b, 0n);
      if (sumW > 0n) {
        let assigned = 0n;
        let maxAt = -1;
        let maxW = 0n;
        valid.forEach((i, k) => {
          const w = weights[k];
          if (w > maxW) {
            maxW = w;
            maxAt = i;
          }
          const a = w === 0n ? 0n : (totalBase * w) / sumW;
          airdrops[i] = a;
          assigned += a;
        });
        // Give the rounding remainder to the largest holder so the sum is exact.
        const rem = totalBase - assigned;
        if (rem > 0n && maxAt >= 0) airdrops[maxAt] = (airdrops[maxAt] as bigint) + rem;
        if (capBase !== null) {
          for (const i of valid) {
            const a = airdrops[i];
            if (a !== null && a > capBase) airdrops[i] = capBase;
          }
        }
      }
    }

    let total = 0n;
    let count = 0;
    for (const a of airdrops) if (a !== null && a > 0n) {
      total += a;
      count++;
    }
    return { airdrops, total, count };
  }, [rows, distMode, perWalletBase, totalBase, capBase]);

  const badAddr = rows.some((r) => nonEmpty(r) && !isAddress(r.address.trim(), { strict: false }));
  // Duplicate addresses break the merkle tree — detect and block until merged.
  const dupCount = useMemo(() => {
    const seen = new Set<string>();
    let d = 0;
    for (const r of rows) {
      const a = r.address.trim().toLowerCase();
      if (!a || !isAddress(a, { strict: false })) continue;
      if (seen.has(a)) d++;
      else seen.add(a);
    }
    return d;
  }, [rows]);
  const canUse = dist.count > 0 && !badAddr && !capInvalid && dupCount === 0;

  const human = (bi: bigint) => (dec !== null ? formatUnits(bi, dec) : bi.toString());
  const totalLabel = `${human(dist.total)} ${unit}`;

  const update = (i: number, key: keyof Row, val: string) =>
    setAndPad(rows.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  const removeRow = (i: number) => {
    const next = rows.filter((_, idx) => idx !== i);
    setRows(next.length ? withTrailingBlank(next) : [{ ...BLANK }]);
  };
  const doDedup = () => setAndPad(dedupSum(rows.filter(nonEmpty)));

  // Serialize the computed airdrop list. `address,amount` (base units) always;
  // an optional third `balance` column for the download when requested.
  const buildCsv = (withBalance: boolean) => {
    const lines = rows
      .map((r, i) => {
        const a = dist.airdrops[i];
        if (a === null || a <= 0n) return null;
        const addr = r.address.trim();
        return withBalance ? `${addr},${a.toString()},${r.amount.trim()}` : `${addr},${a.toString()}`;
      })
      .filter(Boolean) as string[];
    const header = withBalance ? "address,amount,balance" : "address,amount";
    return [header, ...lines].join("\n");
  };

  const confirmExport = () => {
    downloadCsv("scatter-drop-airdrop.csv", `${buildCsv(includeBalance)}\n`);
    setExportOpen(false);
  };
  const copyCsv = () => {
    // Copy is address,amount only — the balance column is a download-time choice.
    navigator.clipboard?.writeText(buildCsv(false));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  const useInCampaign = () => {
    try {
      // The campaign draft is always address,amount (base units) — no balance col.
      localStorage.setItem(DRAFT_CSV_KEY, buildCsv(false));
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
          Two steps: aggregate the recipients (from a Dune query or a CSV), then
          decide how much each one gets.
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
            <DuneImport onRows={loadRecipients} />
          </div>

          {/* Source: upload / paste / hand-edit — the shared recipient CSV */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-slate-100 mr-auto">Recipient CSV</h2>
              <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5">
                <ViewBtn active={view === "csv"} onClick={() => setView("csv")}>CSV</ViewBtn>
                <ViewBtn active={view === "table"} onClick={() => setView("table")}>Table</ViewBtn>
              </div>
              <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} />
              <ToolbarBtn onClick={() => fileRef.current?.click()} icon={<Upload className="w-3.5 h-3.5" />}>
                Upload CSV
              </ToolbarBtn>
              <ToolbarBtn onClick={() => setCsvText("")} disabled={!csvText.trim()}>
                Clear
              </ToolbarBtn>
            </div>
            <p className="text-[11px] text-slate-500">
              One <span className="font-mono">address,balance</span> per line. A Dune fetch above
              fills this box; you can also upload, paste, or type directly.
            </p>

            {view === "csv" ? (
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={10}
                spellCheck={false}
                placeholder={"0xabc…,1000000000000000000\n0xdef…,500000000000000000"}
                className="input font-mono text-xs"
              />
            ) : (
              <CsvTable rows={parsedRows} />
            )}

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
        <div className="space-y-4">
          {/* Airdrop token */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-2">
            <h2 className="text-sm font-bold text-slate-100">Airdrop token</h2>
            <p className="text-[11px] text-slate-500">
              The token you will distribute. Set it to enter amounts in whole tokens (scaled by its
              decimals); leave empty to enter raw base units.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="0x… token contract"
                spellCheck={false}
                className="input font-mono text-xs flex-1 min-w-[18rem]"
              />
              {tokenTrimmed && !tokenOk && <span className="text-xs text-red-500">Invalid address</span>}
              {tokenOk && dec !== null && (
                <span className="text-xs font-mono text-emerald-600">
                  {symbol ?? "TOKEN"} · {dec} decimals
                </span>
              )}
              {tokenOk && dec === null && (
                <span className="text-xs text-slate-500">reading… (or not an ERC-20 on this chain)</span>
              )}
            </div>
          </div>

          {/* Distribution method */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-100">How to distribute</h2>
              <p className="text-[11px] text-slate-500">
                Pick a method, then set its value — the amount each wallet receives updates live in
                the list below.
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <MethodCard
                active={distMode === "equal"}
                onClick={() => setDistMode("equal")}
                title="Same for everyone"
                desc="Every wallet gets an equal amount, regardless of balance."
              />
              <MethodCard
                active={distMode === "prorata"}
                onClick={() => setDistMode("prorata")}
                title="Proportional to balance"
                desc="A fixed total, split across wallets by their snapshot balance."
              />
              <MethodCard
                active={distMode === "sqrt"}
                onClick={() => setDistMode("sqrt")}
                title="Proportional to √balance"
                desc="Split by the square root of each balance — dampens whales, flatter distribution."
              />
            </div>

            {distMode === "equal" ? (
              <div className="space-y-1.5">
                <Field
                  label="Amount per wallet"
                  hint={`Each wallet receives this much (${unit}).`}
                  invalid={perWallet.trim() !== "" && perWalletBase === null}
                >
                  <input
                    value={perWallet}
                    onChange={(e) => setPerWallet(e.target.value)}
                    placeholder={dec !== null ? "e.g. 10" : "amount (base units)"}
                    className="input font-mono text-xs w-56"
                  />
                  <UnitTag unit={unit} />
                </Field>
                {perWalletBase !== null && dist.count > 0 && (
                  <p className="text-[11px] text-slate-400">
                    Total airdrop ={" "}
                    <span className="font-mono text-emerald-500">
                      {human(dist.total)} {unit}
                    </span>{" "}
                    across {dist.count.toLocaleString()} wallets.
                  </p>
                )}
              </div>
            ) : (
              <Field
                label="Total to distribute"
                hint={`This total is split across all wallets by ${
                  distMode === "sqrt" ? "√balance" : "balance"
                } (${unit}).`}
                invalid={totalDistribute.trim() !== "" && totalBase === null}
              >
                <input
                  value={totalDistribute}
                  onChange={(e) => setTotalDistribute(e.target.value)}
                  placeholder={dec !== null ? "e.g. 1000000" : "total (base units)"}
                  className="input font-mono text-xs w-56"
                />
                <UnitTag unit={unit} />
              </Field>
            )}

            {distMode !== "equal" && (
              <Field
                label="Cap per wallet (optional)"
                hint="Limit any single wallet to at most this — useful when one holder is huge."
                invalid={capInvalid}
              >
                <input
                  value={capValue}
                  onChange={(e) => setCapValue(e.target.value)}
                  placeholder="no cap"
                  className="input font-mono text-xs w-56"
                />
                <UnitTag unit={unit} />
              </Field>
            )}

          </div>

          {/* Airdrop preview */}
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-slate-100 mr-auto">
              Airdrop
              <span className="ml-2 text-xs font-normal text-slate-400">
                {dist.count.toLocaleString()} recipients · total {totalLabel}
                {badAddr && <span className="text-amber-600"> · fix invalid address(es)</span>}
                {dupCount > 0 && (
                  <span className="text-amber-600"> · {dupCount} duplicate address(es)</span>
                )}
              </span>
            </h2>
            {dupCount > 0 && (
              <ToolbarBtn onClick={doDedup}>Merge duplicates</ToolbarBtn>
            )}
            <ToolbarBtn onClick={backToAggregate} icon={<ArrowLeft className="w-3.5 h-3.5" />}>
              Re-aggregate
            </ToolbarBtn>
            <ToolbarBtn onClick={() => setExportOpen(true)} icon={<Download className="w-3.5 h-3.5" />} disabled={!canUse}>
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
                  <th className="px-3 py-2 w-56">Balance (base units)</th>
                  <th className="px-3 py-2 w-56 text-right">Airdrop amount</th>
                  <th className="w-10 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, RENDER_CAP).map((r, i) => {
                  const addrBad = nonEmpty(r) && !isAddress(r.address.trim(), { strict: false });
                  const a = dist.airdrops[i];
                  return (
                    <tr key={i} className="border-b border-slate-800/60 last:border-0">
                      <td className="px-3 py-1 text-right font-mono text-[11px] text-slate-500">{i + 1}</td>
                      <td className="px-1 py-1">
                        <input
                          value={r.address}
                          onChange={(e) => update(i, "address", e.target.value)}
                          placeholder="0x…"
                          className={`w-full bg-transparent px-2 py-1 rounded font-mono text-xs outline-none focus:bg-slate-950 ${
                            addrBad ? "text-red-500" : "text-slate-100"
                          }`}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={r.amount}
                          onChange={(e) => update(i, "amount", e.target.value)}
                          placeholder="0"
                          className="w-full bg-transparent px-2 py-1 rounded font-mono text-xs text-slate-300 outline-none focus:bg-slate-950"
                        />
                      </td>
                      <td className="px-3 py-1 text-right font-mono text-xs">
                        {a !== null && a > 0n ? (
                          <span className="text-emerald-500">
                            {human(a)}
                            {dec !== null && <span className="text-slate-500"> {symbol ?? ""}</span>}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
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
            {rows.filter(nonEmpty).length > RENDER_CAP && (
              <p className="px-3 py-2 text-[11px] text-slate-500 border-t border-slate-800">
                Showing first {RENDER_CAP.toLocaleString()} rows — totals and export cover all{" "}
                {rows.filter(nonEmpty).length.toLocaleString()}.
              </p>
            )}
          </div>

          {exportOpen && (
            <ExportModal
              count={dist.count}
              includeBalance={includeBalance}
              setIncludeBalance={setIncludeBalance}
              onCancel={() => setExportOpen(false)}
              onConfirm={confirmExport}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ExportModal({
  count,
  includeBalance,
  setIncludeBalance,
  onCancel,
  onConfirm,
}: {
  count: number;
  includeBalance: boolean;
  setIncludeBalance: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-slate-100">Export CSV</h3>
        <p className="text-[11px] text-slate-400">
          {count.toLocaleString()} recipients · columns{" "}
          <span className="font-mono text-slate-300">
            address,amount{includeBalance ? ",balance" : ""}
          </span>
          .
        </p>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={includeBalance}
            onChange={(e) => setIncludeBalance(e.target.checked)}
            className="accent-emerald-500"
          />
          Include the snapshot balance as an extra column
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn text-xs">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-4 py-2 rounded-lg text-sm transition"
          >
            <Download className="w-3.5 h-3.5" /> Download
          </button>
        </div>
      </div>
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

function MethodCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border p-3 transition ${
        active
          ? "border-emerald-500/50 bg-emerald-500/10"
          : "border-slate-800 bg-slate-950 hover:border-slate-700"
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
        <span
          className={`h-3.5 w-3.5 rounded-full border-2 ${
            active ? "border-emerald-500 bg-emerald-500" : "border-slate-600"
          }`}
        />
        {title}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">{desc}</p>
    </button>
  );
}

function Field({
  label,
  hint,
  invalid,
  children,
}: {
  label: string;
  hint: string;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-mono text-slate-300">{label}</label>
      <div className="flex items-center gap-2">{children}</div>
      <p className={`text-[11px] ${invalid ? "text-red-500" : "text-slate-500"}`}>
        {invalid ? "Enter a positive number." : hint}
      </p>
    </div>
  );
}

function UnitTag({ unit }: { unit: string }) {
  return <span className="text-[11px] font-mono text-slate-400">{unit}</span>;
}

const CSV_PREVIEW_CAP = 1000;
function CsvTable({ rows }: { rows: Row[] }) {
  const filled = rows.filter((r) => r.address.trim() !== "" || r.amount.trim() !== "");
  if (filled.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-center text-xs text-slate-500">
        No recipients yet — fetch from Dune, upload a CSV, or switch to the CSV view to paste.
      </div>
    );
  }
  const shown = filled.slice(0, CSV_PREVIEW_CAP);
  return (
    <div className="overflow-auto rounded-lg border border-slate-800 max-h-96">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 bg-slate-950">
          <tr className="text-left font-mono uppercase tracking-wider text-[10px] text-slate-400">
            <th className="w-12 px-3 py-2 text-right border-b border-slate-800">#</th>
            <th className="px-3 py-2 border-b border-slate-800">Address</th>
            <th className="px-3 py-2 border-b border-slate-800">Balance (base units)</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => {
            const bad = !isAddress(r.address.trim(), { strict: false });
            return (
              <tr key={i} className="odd:bg-slate-900/40">
                <td className="px-3 py-1 text-right font-mono text-slate-500 border-r border-slate-800/60">{i + 1}</td>
                <td className={`px-3 py-1 font-mono border-r border-slate-800/60 ${bad ? "text-red-500" : "text-slate-200"}`}>
                  {r.address || <span className="text-slate-600">—</span>}
                </td>
                <td className="px-3 py-1 font-mono text-slate-200">
                  {r.amount || <span className="text-slate-600">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {filled.length > CSV_PREVIEW_CAP && (
        <p className="px-3 py-2 text-[11px] text-slate-500 border-t border-slate-800">
          Showing first {CSV_PREVIEW_CAP.toLocaleString()} of {filled.length.toLocaleString()} — all
          are kept.
        </p>
      )}
    </div>
  );
}

function ViewBtn({
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
      onClick={onClick}
      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
        active ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
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
