"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { formatUnits, isAddress, parseUnits } from "viem";
import { ArrowLeft, ArrowRight, Check, Copy, Download, Trash2, Upload } from "lucide-react";
import { DuneImport, type Recipient } from "@/components/DuneImport";
import { inkBtnClass, pillClass, POP_PANEL, popInputClass, whiteBtnClass } from "@/components/pop";
import { PageHeader } from "@/components/ui";
import { StakingImport } from "@/components/StakingImport";
import { useErc20Decimals, useErc20Symbol } from "@/lib/contracts";
import { useAllowedTokens } from "@/lib/campaigns";
import { isPositiveDecimal } from "@/lib/validation";
import { downloadCsv } from "@/lib/download";
import { DRAFT_CSV_KEY } from "@/lib/draftCsv";

type Row = Recipient;
const BLANK: Row = { address: "", amount: "" };
const DEC = /^\d+$/;
// Cap how many rows the step-2 grid renders (totals/export still cover all).
const RENDER_CAP = 500;

/** Cream shell for the ViewBtn segmented toggles (promote to pop.ts with its
 *  StakingImport twin at stage 3). */
const SEG_WRAP = "inline-flex rounded-full border-2 border-ink/15 bg-pop-cream p-0.5";

/** Step CTA — primary ink pill with the shared disabled treatment. */
const CTA_CLS = `inline-flex items-center gap-2 text-sm disabled:opacity-50 disabled:pointer-events-none ${inkBtnClass("lg")}`;

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
    .filter((l) => l !== "" && !l.startsWith("#"))
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
  // Which aggregation source to show in step 1: token/NFT holders (Dune) or
  // Tokamak staking balances (Dune candidates → stakeOf snapshot).
  const [source, setSource] = useState<"dune" | "staking">("dune");
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
  const { data: allowedTokens } = useAllowedTokens();
  const { data: decData } = useErc20Decimals(tokenAddr);
  const { data: symData } = useErc20Symbol(tokenAddr);
  // Prefer the allow-list's symbol; fall back to the on-chain read.
  const listedSymbol = allowedTokens?.find(
    (t) => t.token.toLowerCase() === tokenTrimmed.toLowerCase(),
  )?.symbol;
  const symbol = listedSymbol ?? (typeof symData === "string" && symData ? symData : undefined);
  // Decimals come from the selected (allow-listed) token on-chain; 18 while the
  // read resolves. Amounts are entered in whole tokens and scaled by this to
  // the base units (wei) the merkle math carries; the exported CSV is human units.
  const dec = tokenOk && decData != null ? Number(decData) : 18;
  const unit = symbol ?? "tokens";

  // Parse a whole-token input to base units. Returns null on empty/invalid.
  const toBase = (v: string): bigint | null => {
    const t = v.trim();
    if (!t || !isPositiveDecimal(t, dec)) return null;
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
  // Decimals gate: amounts scale by the selected token's decimals and the
  // export states its unit — without a token (or while its decimals are still
  // being read) both would be guesses on the silent 18-dp fallback.
  const decReady = tokenOk && decData != null;
  const canUse = decReady && dist.count > 0 && !badAddr && !capInvalid && dupCount === 0;

  const human = (bi: bigint) => formatUnits(bi, dec);
  const totalLabel = `${human(dist.total)} ${unit}`;

  const update = (i: number, key: keyof Row, val: string) =>
    setAndPad(rows.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  const removeRow = (i: number) => {
    const next = rows.filter((_, idx) => idx !== i);
    setRows(next.length ? withTrailingBlank(next) : [{ ...BLANK }]);
  };
  const doDedup = () => setAndPad(dedupSum(rows.filter(nonEmpty)));

  // Serialize the computed airdrop list. `address,amount` with amounts in
  // human token units (formatUnits — lossless), matching what the campaign
  // wizard's CSV box expects; an optional third `balance` column (the pasted
  // source balances, base units) for the download when requested.
  const buildCsv = (withBalance: boolean) => {
    const lines = rows
      .map((r, i) => {
        const a = dist.airdrops[i];
        if (a === null || a <= 0n) return null;
        const addr = r.address.trim();
        return withBalance ? `${addr},${human(a)},${r.amount.trim()}` : `${addr},${human(a)}`;
      })
      .filter(Boolean) as string[];
    const header = withBalance ? "address,amount,balance" : "address,amount";
    // Unit note as a '#' comment — parseCsv (and csvToRows above) skip it, so
    // the file/paste still round-trips. The symbol is reduced to printable
    // ASCII: an exotic on-chain symbol must not break the CSV structure.
    const safeUnit = unit.replace(/[^ -~]/g, "").trim() || "tokens";
    // No commas in the note — spreadsheet apps would split it into columns.
    const note = `# amounts in ${safeUnit} - token units with decimals applied (not wei/base units)${
      withBalance ? "; balance column = source balances in base units" : ""
    }`;
    return [note, header, ...lines].join("\n");
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
      // The campaign draft is always address,amount (human units) — no balance col.
      localStorage.setItem(DRAFT_CSV_KEY, buildCsv(false));
    } catch {
      /* ignore */
    }
    router.push("/manage/new");
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        eyebrow="Tools"
        title="Recipient list builder"
        subtitle="Two steps: aggregate the recipients (from a Dune query or a CSV), then decide how much each one gets."
      />

      {/* Wizard step indicator */}
      <div className="flex items-center gap-2">
        <StepPill
          n={1}
          label="Aggregate recipients"
          active={step === 1}
          onClick={() => step === 2 && backToAggregate()}
        />
        <span className="h-0.5 w-6 bg-ink/20" />
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
          {/* Source picker → fills the CSV below */}
          <div className={`bg-white p-5 space-y-4 ${POP_PANEL}`}>
            <div className={SEG_WRAP}>
              <ViewBtn active={source === "dune"} onClick={() => setSource("dune")}>
                Token / NFT holders
              </ViewBtn>
              <ViewBtn active={source === "staking"} onClick={() => setSource("staking")}>
                Staking (Tokamak)
              </ViewBtn>
            </div>
            {/* DuneImport/StakingImport keep their transitional classes (the
                inverted slate palette renders them light) until their own
                rollout stage. */}
            {source === "dune" ? (
              <DuneImport onRows={loadRecipients} />
            ) : (
              <StakingImport onRows={loadRecipients} />
            )}
          </div>

          {/* Source: upload / paste / hand-edit — the shared recipient CSV */}
          <div className={`bg-white p-5 space-y-3 ${POP_PANEL}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-ink mr-auto">Recipient CSV</h2>
              <div className={SEG_WRAP}>
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
            <p className="text-[11px] text-ink/50">
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
                className={popInputClass("rounded-2xl px-3 py-2 font-mono")}
              />
            ) : (
              <CsvTable rows={parsedRows} />
            )}

            <div className="flex items-center gap-3">
              <span className="text-xs text-ink/60 font-mono">
                {parsedCount.toLocaleString()} recipient(s)
              </span>
              <button
                onClick={goToAmounts}
                disabled={parsedCount === 0}
                className={`ml-auto ${CTA_CLS}`}
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
          <div className={`bg-white p-5 space-y-2 ${POP_PANEL}`}>
            <h2 className="text-sm font-bold text-ink">Airdrop token</h2>
            <p className="text-[11px] text-ink/50">
              Choose the token you will distribute — only admin allow-listed tokens can be airdropped
              on-chain. Amounts are entered in whole tokens and scaled by the decimals.
            </p>
            <select
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className={popInputClass("rounded-full px-3 py-2 font-mono")}
            >
              <option value="">Select an allow-listed token…</option>
              {(allowedTokens ?? []).map((t) => (
                <option key={t.token} value={t.token}>
                  {t.symbol} — {t.token.slice(0, 8)}…{t.token.slice(-6)}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {allowedTokens && allowedTokens.length === 0 && (
                <span className="text-amber-600">
                  No tokens are on the platform allow-list yet — ask the admin to add one.
                </span>
              )}
              {tokenOk && (
                <span className="text-ink/50">
                  {symbol && <span className="font-mono font-bold text-ink">{symbol} </span>}·{" "}
                  {decData != null ? `${dec} decimals` : "reading decimals…"} · 1 ={" "}
                  {`1${"0".repeat(dec)}`} base units
                </span>
              )}
            </div>
          </div>

          {/* Distribution method */}
          <div className={`bg-white p-5 space-y-4 ${POP_PANEL}`}>
            <div>
              <h2 className="text-sm font-bold text-ink">How to distribute</h2>
              <p className="text-[11px] text-ink/50">
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
                    placeholder="e.g. 1"
                    className={popInputClass("rounded-full px-3 py-2 font-mono w-56")}
                  />
                  <UnitTag unit={unit} />
                </Field>
                {perWalletBase !== null && dist.count > 0 && (
                  <p className="text-[11px] text-ink/60">
                    Total airdrop ={" "}
                    <span className="font-mono font-bold text-ink">
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
                  placeholder="e.g. 1000"
                  className={popInputClass("rounded-full px-3 py-2 font-mono w-56")}
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
                  className={popInputClass("rounded-full px-3 py-2 font-mono w-56")}
                />
                <UnitTag unit={unit} />
              </Field>
            )}

          </div>

          {/* Airdrop preview */}
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-ink mr-auto">
              Airdrop
              <span className="ml-2 text-xs font-normal text-ink/60">
                {dist.count.toLocaleString()} recipients · total {totalLabel}
                {!tokenOk ? (
                  <span className="text-amber-600"> · select the airdrop token above</span>
                ) : decData == null ? (
                  <span className="text-amber-600"> · reading token decimals…</span>
                ) : null}
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
            <ToolbarBtn onClick={copyCsv} icon={copied ? <Check className="w-3.5 h-3.5 text-ink" /> : <Copy className="w-3.5 h-3.5" />} disabled={!canUse}>
              {copied ? "Copied" : "Copy"}
            </ToolbarBtn>
            <button
              onClick={useInCampaign}
              disabled={!canUse}
              className={CTA_CLS}
            >
              Use in a campaign <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className={`overflow-x-auto bg-white ${POP_PANEL}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-ink/50 border-b border-ink/10">
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
                    <tr key={i} className="border-b border-ink/10 last:border-0">
                      <td className="px-3 py-1 text-right font-mono text-[11px] text-ink/40">{i + 1}</td>
                      <td className="px-1 py-1">
                        <input
                          value={r.address}
                          onChange={(e) => update(i, "address", e.target.value)}
                          placeholder="0x…"
                          className={`w-full bg-transparent px-2 py-1 rounded font-mono text-xs outline-none focus:bg-pop-cream ${
                            addrBad ? "text-rose-500" : "text-ink"
                          }`}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={r.amount}
                          onChange={(e) => update(i, "amount", e.target.value)}
                          placeholder="0"
                          className="w-full bg-transparent px-2 py-1 rounded font-mono text-xs text-ink/70 outline-none focus:bg-pop-cream"
                        />
                      </td>
                      <td className="px-3 py-1 text-right font-mono text-xs">
                        {a !== null && a > 0n ? (
                          <span className="font-semibold text-ink">
                            {human(a)}
                            {symbol && <span className="font-normal text-ink/50"> {symbol}</span>}
                          </span>
                        ) : (
                          <span className="text-ink/30">—</span>
                        )}
                      </td>
                      <td className="px-1 py-1 text-center">
                        {nonEmpty(r) && (
                          <button type="button" onClick={() => removeRow(i)} className="text-ink/40 hover:text-rose-500 transition" title="Remove row">
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
              <p className="px-3 py-2 text-[11px] text-ink/50 border-t border-ink/10">
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
  // Portal to <body> so the overlay escapes any transformed ancestor (the page
  // root's animate-fade-in), otherwise `fixed` centers within the tall page box
  // and the modal lands off-screen.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className={`w-full max-w-sm bg-white p-5 space-y-4 ${POP_PANEL}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-ink">Export CSV</h3>
        <p className="text-[11px] text-ink/60">
          {count.toLocaleString()} recipients · columns{" "}
          <span className="font-mono text-ink">
            address,amount{includeBalance ? ",balance" : ""}
          </span>
          .
        </p>
        <label className="flex items-center gap-2 text-xs text-ink/80">
          <input
            type="checkbox"
            checked={includeBalance}
            onChange={(e) => setIncludeBalance(e.target.checked)}
            className="accent-ink"
          />
          Include the snapshot balance as an extra column
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className={`text-xs ${whiteBtnClass("md")}`}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`inline-flex items-center gap-1.5 text-sm ${inkBtnClass("md")}`}
          >
            <Download className="w-3.5 h-3.5" /> Download
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "step" : undefined}
      className={pillClass(
        active,
        "bg-pop-yellow",
        "inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed",
      )}
    >
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-mono ${
          active ? "bg-ink text-white" : "bg-ink/10 text-ink/60"
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
      aria-pressed={active}
      className={`text-left rounded-2xl border-2 p-3 transition ${
        active
          ? "border-ink bg-pop-yellow"
          : "border-ink/15 bg-pop-cream hover:border-ink/40"
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span
          className={`h-3.5 w-3.5 rounded-full border-2 ${
            active ? "border-ink bg-ink" : "border-ink/30"
          }`}
        />
        {title}
      </div>
      <p className="mt-1 text-[11px] text-ink/60">{desc}</p>
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
      <label className="text-xs font-mono font-bold text-ink/70">{label}</label>
      <div className="flex items-center gap-2">{children}</div>
      <p className={`text-[11px] ${invalid ? "text-rose-500" : "text-ink/50"}`}>
        {invalid ? "Enter a positive number." : hint}
      </p>
    </div>
  );
}

function UnitTag({ unit }: { unit: string }) {
  return <span className="text-[11px] font-mono text-ink/50">{unit}</span>;
}

const CSV_PREVIEW_CAP = 1000;
function CsvTable({ rows }: { rows: Row[] }) {
  const filled = rows.filter((r) => r.address.trim() !== "" || r.amount.trim() !== "");
  if (filled.length === 0) {
    return (
      <div className="rounded-2xl border border-ink/15 bg-pop-cream p-4 text-center text-xs text-ink/50">
        No recipients yet — fetch from Dune, upload a CSV, or switch to the CSV view to paste.
      </div>
    );
  }
  const shown = filled.slice(0, CSV_PREVIEW_CAP);
  return (
    <div className="overflow-auto rounded-2xl border border-ink/15 max-h-96">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 bg-pop-cream">
          <tr className="text-left font-mono uppercase tracking-wider text-[10px] text-ink/50">
            <th className="w-12 px-3 py-2 text-right border-b border-ink/15">#</th>
            <th className="px-3 py-2 border-b border-ink/15">Address</th>
            <th className="px-3 py-2 border-b border-ink/15">Balance (base units)</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => {
            const bad = !isAddress(r.address.trim(), { strict: false });
            return (
              <tr key={i} className="odd:bg-pop-cream/50">
                <td className="px-3 py-1 text-right font-mono text-ink/40 border-r border-ink/10">{i + 1}</td>
                <td className={`px-3 py-1 font-mono border-r border-ink/10 ${bad ? "text-rose-500" : "text-ink"}`}>
                  {r.address || <span className="text-ink/30">—</span>}
                </td>
                <td className="px-3 py-1 font-mono text-ink">
                  {r.amount || <span className="text-ink/30">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {filled.length > CSV_PREVIEW_CAP && (
        <p className="px-3 py-2 text-[11px] text-ink/50 border-t border-ink/15">
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
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-2.5 py-1 text-[11px] font-bold rounded-full transition ${
        active ? "bg-ink text-white" : "text-ink/50 hover:text-ink"
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
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 text-xs disabled:opacity-50 disabled:pointer-events-none ${whiteBtnClass("md")}`}
    >
      {icon}
      {children}
    </button>
  );
}
