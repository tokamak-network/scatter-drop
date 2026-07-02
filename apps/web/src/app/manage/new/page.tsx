"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useBalance, useChainId, useChains } from "wagmi";
import {
  formatUnits,
  isAddress,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import {
  AirdropType,
  airdropTypeLabel,
  buildApproveRequest,
  buildCreateDropRequest,
  buildDrop,
  getZkX509,
  NATIVE_ETH,
  parseCsv,
  TokenTier,
  type DropManifest,
} from "@tokamak-network/scatter-drop-sdk";
import { ArrowLeft, ArrowRight, Check, Download, Upload } from "lucide-react";
import Link from "next/link";
import { ConnectGate } from "@/components/ConnectGate";
import { SnapshotBuilder } from "@/components/SnapshotBuilder";
import { TxButton } from "@/components/TxButton";
import type { SnapshotManifest } from "@/lib/useSnapshotJob";
import { useAllowedTokens } from "@/lib/campaigns";
import { DRAFT_CSV_KEY } from "@/lib/draftCsv";
import { downloadCsv } from "@/lib/downloadCsv";
import { explorerUrl } from "@/lib/explorer";
import { publishProofs } from "@/lib/proofs";
import {
  deploymentIssue,
  useComputedFee,
  useDeployment,
  useErc20Allowance,
  useErc20Balance,
  useErc20Decimals,
  useErc20Symbol,
  useFeeBpsOf,
  useFeeModeOf,
  usePaused,
  useTokenTier,
} from "@/lib/contracts";

const SAMPLE_CSV =
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8,1000\n0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,500";

function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "scatter-drop-recipients-sample.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

const STEPS = ["Operator", "Basics", "Eligibility", "Recipients", "Create"];

const TYPES = [
  AirdropType.CSV,
  AirdropType.ONCHAIN_SNAPSHOT,
  AirdropType.ONCHAIN_GATED,
  AirdropType.SOCIAL,
];

/**
 * Parse the recipients CSV using the SDK `parseCsv` (single source of truth) and
 * build the Merkle drop, so the wizard's tree/root/total match the SDK + claim
 * path exactly. `parseCsv` amounts are base-unit integers (wei-like, NO 18-dp
 * assumption); it and `buildDrop` throw on malformed/duplicate rows, which we
 * surface as a message instead of crashing the render.
 */
function parseRecipients(text: string): {
  manifest: DropManifest | null;
  error: string | null;
} {
  if (!text.trim()) return { manifest: null, error: null };
  try {
    const entries = parseCsv(text);
    if (entries.length === 0) return { manifest: null, error: null };
    return { manifest: buildDrop(entries), error: null };
  } catch (e) {
    return { manifest: null, error: e instanceof Error ? e.message : "Invalid CSV" };
  }
}

export default function NewCampaignPage() {
  const { data: dep, isLoading: depLoading } = useDeployment();
  const factory = dep?.dropFactory;
  const registries = dep ? getZkX509(dep.chainId) : undefined;
  const depIssue = deploymentIssue(dep, depLoading);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [token, setToken] = useState("");
  const [registry, setRegistry] = useState<Address | "">("");
  const [type, setType] = useState<AirdropType>(AirdropType.CSV);
  const [csv, setCsv] = useState("");
  const csvFileRef = useRef<HTMLInputElement>(null);
  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ""));
    reader.readAsText(file);
    e.target.value = ""; // allow re-selecting the same file
  }
  const [startDate, setStartDate] = useState("");
  const [deadline, setDeadline] = useState("");
  // W24: identity gate is optional. Off → open claim (identityRegistry = 0).
  const [identityRequired, setIdentityRequired] = useState(true);

  const registryAddr = (registry || registries?.usersRegistry) as
    | Address
    | undefined;
  const tokenValid = isAddress(token);

  // Admin-curated allow-list: createDrop requires tokenTier == ALLOWED.
  // Operators can't self-register tokens (W23) — they request the admin.
  const { data: tier } = useTokenTier(
    factory,
    tokenValid ? (token as Address) : undefined,
  );
  const tierAllowed = tier !== undefined && Number(tier) === TokenTier.ALLOWED;

  // Debounce parsing/Merkle build so large lists don't rebuild on every keystroke.
  const [parsed, setParsed] = useState<{
    manifest: DropManifest | null;
    error: string | null;
  }>({ manifest: null, error: null });
  useEffect(() => {
    const t = setTimeout(() => setParsed(parseRecipients(csv)), 400);
    return () => clearTimeout(t);
  }, [csv]);
  const { manifest, error: csvError } = parsed;

  // Prefill from the /tools CSV builder ("Use in a campaign") once on mount.
  useEffect(() => {
    try {
      const draft = localStorage.getItem(DRAFT_CSV_KEY);
      if (draft) {
        setType(AirdropType.CSV);
        setCsv(draft);
        localStorage.removeItem(DRAFT_CSV_KEY);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Snapshot mode (ONCHAIN_SNAPSHOT) sources recipients from a server-side
  // holder scan instead of a pasted CSV.
  const isSnapshot = type === AirdropType.ONCHAIN_SNAPSHOT;
  const [snapResult, setSnapResult] = useState<SnapshotManifest | null>(null);
  const activeManifest = isSnapshot ? snapResult : manifest;
  const recipientCount = activeManifest?.count ?? 0;
  const totalAmount = activeManifest ? BigInt(activeManifest.totalAmount) : 0n;
  const merkleRoot = (activeManifest?.merkleRoot ?? `0x${"0".repeat(64)}`) as Hex;

  // W22: fee = computed on the airdrop token (percent of total or flat). The
  // operator deposits total + fee (on-top); pool gets total, vault gets fee.
  const { data: fee } = useComputedFee(
    factory,
    tokenValid ? (token as Address) : undefined,
    totalAmount,
  );
  const totalDeposit = totalAmount + (fee ?? 0n);

  // Native ETH airdrop: the sentinel token, funded via msg.value (no approve).
  const isNative =
    tokenValid && (token as string).toLowerCase() === NATIVE_ETH.toLowerCase();

  // Fee mode/rate for an inline label next to the fee (0 PERCENT / 1 FLAT).
  const { data: feeMode } = useFeeModeOf(factory, tokenValid ? (token as Address) : undefined);
  const { data: feeBps } = useFeeBpsOf(factory, tokenValid ? (token as Address) : undefined);
  const feeRateLabel =
    feeMode === undefined
      ? ""
      : Number(feeMode) === 0
        ? `${Number(feeBps ?? 0) / 100}% of total`
        : "flat per drop";

  // The connected wallet must hold total + fee (in the airdrop token, or ETH for
  // native) or it can't fund the drop — block Approve/Create with a clear reason.
  const { address: account } = useAccount();
  const chainId = useChainId();
  const chains = useChains();
  // Resolve the chain from the active chainId (matching the chain-aware reads),
  // not the wallet's connected chain — the two can diverge.
  const currentChain = chains.find((c) => c.id === chainId);
  const explorerAddr = (a: string) => explorerUrl(currentChain, "address", a);
  const { data: erc20Bal } = useErc20Balance(
    !isNative && tokenValid ? (token as Address) : undefined,
    account,
  );
  const { data: nativeBal } = useBalance({
    address: isNative ? account : undefined,
    query: { enabled: isNative && !!account },
  });
  const walletBalance = isNative ? nativeBal?.value : (erc20Bal as bigint | undefined);
  const insufficient =
    !!account && walletBalance !== undefined && totalDeposit > 0n && walletBalance < totalDeposit;

  // Sequential funding: an ERC-20 drop needs an approval before create. Read the
  // current allowance so an already-approved token skips straight to create.
  const { data: allowance } = useErc20Allowance(
    !isNative && tokenValid ? (token as Address) : undefined,
    account,
    factory,
  );
  const [justApproved, setJustApproved] = useState(false);
  // A new token/amount invalidates a prior approval flag.
  useEffect(() => setJustApproved(false), [token, totalDeposit]);
  const approved =
    isNative ||
    justApproved ||
    (allowance !== undefined && totalDeposit > 0n && (allowance as bigint) >= totalDeposit);

  const fmtWhen = (s: string) => (s ? s.replace("T", " ") : "");
  // Resolve the viewer's timezone after mount (avoids SSR/hydration mismatch) so
  // the claim window states its exact zone instead of a vague "local time".
  const [tzLabel, setTzLabel] = useState("local time");
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const total = -new Date().getTimezoneOffset(); // minutes east of UTC
      const sign = total >= 0 ? "+" : "-";
      const h = Math.floor(Math.abs(total) / 60);
      const m = Math.abs(total) % 60;
      const off = `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
      setTzLabel(tz ? `${tz}, ${off}` : off);
    } catch {
      /* keep the default label */
    }
  }, []);
  // Final recipient CSV (address,amount in base units) — exactly what's committed
  // to the merkle root, downloadable as a record before creating.
  const downloadRecipients = () => {
    if (!activeManifest) return;
    const claims = Object.values(activeManifest.claims) as { account: string; amount: string }[];
    const body = claims.map((c) => `${c.account},${c.amount}`).join("\n");
    downloadCsv(`${name.trim() || "airdrop"}-recipients.csv`, `address,amount\n${body}\n`);
  };

  // Operators pick from the admin-curated allow-list rather than pasting an
  // arbitrary address (the on-chain createDrop rejects non-allow-listed tokens).
  const { data: allowedTokens } = useAllowedTokens();

  // Token decimals + symbol for human-readable display (amounts in CSV are base
  // units). Native ETH has no ERC-20 contract, so use 18 / "ETH" directly.
  const { data: erc20Decimals } = useErc20Decimals(
    tokenValid && !isNative ? (token as Address) : undefined,
  );
  const { data: erc20Symbol } = useErc20Symbol(
    tokenValid && !isNative ? (token as Address) : undefined,
  );
  const decimals = isNative ? 18 : erc20Decimals;
  // Show the real token symbol instead of a generic "tokens" once it's known.
  const unit = isNative ? "ETH" : erc20Symbol ? String(erc20Symbol) : "tokens";
  const fmtAmount = (v: bigint) =>
    decimals !== undefined
      ? `${formatUnits(v, decimals)} ${unit}`
      : `${v.toString()} base units`;

  // datetime-local values (YYYY-MM-DDTHH:MM:SS, no tz) are parsed as local time,
  // to the second, then converted to unix seconds for the on-chain window.
  const toUnix = (v: string) => {
    if (!v) return 0;
    const ms = new Date(v).getTime();
    return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
  };
  const startUnix = toUnix(startDate);
  const deadlineUnix = toUnix(deadline);

  const recipientsValid = activeManifest !== null;
  // Deadline must be in the future and after the start (mirrors on-chain checks;
  // MIN_DURATION is still enforced on-chain).
  const nowSec = Math.floor(Date.now() / 1000);
  const windowValid =
    deadlineUnix > nowSec && (startUnix === 0 || deadlineUnix > startUnix);
  // Identity gate satisfied: either off (open claim) or a registry is chosen.
  const identityOk = !identityRequired || !!registryAddr;
  const feeValid = fee !== undefined;
  // Service pause: while the platform is paused, createDrop reverts on-chain, so
  // block creation in the UI too (with a clear reason).
  const { data: paused } = usePaused(factory);
  const isPaused = paused === true;
  const ready =
    !!factory &&
    tokenValid &&
    tierAllowed &&
    recipientsValid &&
    windowValid &&
    identityOk &&
    feeValid &&
    !isPaused;

  // On-top: a single approval of the airdrop token for total + fee. Gate on the
  // fee being resolved so we never approve total-only (which would under-fund).
  // ERC-20 drops need one approval for total + fee. Native ETH drops carry the
  // funds in msg.value, so there's no approval step.
  const approveTokenReq =
    !isNative && factory && tokenValid && fee !== undefined && totalDeposit > 0n
      ? buildApproveRequest(token as Address, factory, totalDeposit)
      : null;
  const createReq =
    ready && factory
      ? buildCreateDropRequest(factory, {
          airdropType: type,
          airdropToken: token as Address,
          merkleRoot,
          totalAmount,
          startTime: BigInt(startUnix),
          deadline: BigInt(deadlineUnix),
          identityRegistry:
            identityRequired && registryAddr ? registryAddr : zeroAddress,
          // For native ETH, the builder sets msg.value = totalAmount + fee.
          fee: fee ?? 0n,
        })
      : null;

  const canNext =
    step === 0 ||
    (step === 1 && tokenValid && identityOk && name.trim().length > 0) ||
    step === 2 ||
    (step === 3 && recipientsValid && windowValid) ||
    step === 4;

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <Link
        href="/manage"
        className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-100 transition text-sm font-mono"
      >
        <ArrowLeft className="w-4 h-4" /> BACK TO CONSOLE
      </Link>

      <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
        New Campaign
      </h1>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div
              className={`flex items-center gap-2 text-xs font-mono ${i <= step ? "text-emerald-600" : "text-slate-500"}`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  i < step
                    ? "bg-emerald-500 text-white"
                    : i === step
                      ? "bg-emerald-500/20 text-emerald-600 border border-emerald-500"
                      : "bg-slate-800 text-slate-500"
                }`}
              >
                {i < step ? <Check className="w-3 h-3" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px flex-1 ${i < step ? "bg-emerald-500" : "bg-slate-800"}`}
              />
            )}
          </div>
        ))}
      </div>

      <ConnectGate prompt="Step 0 — operator identity verification is required to create a campaign. Connect your wallet to begin.">
        {depIssue || !factory ? (
          <p className="text-slate-400 text-sm">{depIssue ?? "No deployment."}</p>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
            {step === 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-slate-200">
                  Operator identity gate
                </h2>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Creating a campaign requires your wallet to be verified in the
                  operator registry (operatorRegistry.verifiedUntil(you) ≥ now),
                  enforced on-chain at createDrop. Verify via zk-X509 if needed.
                </p>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-200">
                  Basics &amp; eligibility gate
                </h2>
                <Field label="Campaign name">
                  <input
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Acme Loyalty Drop"
                  />
                </Field>
                <Field label="Description">
                  <input
                    className="input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Reward for verified customers"
                  />
                </Field>
                <Field label="Distribution token (allow-list)">
                  {allowedTokens && allowedTokens.length > 0 ? (
                    <>
                      <select
                        className="input"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                      >
                        <option value="">Select a token…</option>
                        {allowedTokens.map((a) => (
                          <option key={a.token} value={a.token}>
                            {a.symbol} — {a.token.slice(0, 8)}…{a.token.slice(-6)}
                          </option>
                        ))}
                      </select>
                      {token && (
                        <p className="text-[11px] text-slate-500 font-mono mt-1 break-all">
                          {token}
                        </p>
                      )}
                      {isNative && (
                        <span className="text-[11px] text-slate-500">
                          Native ETH — funded via your wallet (msg.value), no token
                          approval needed.
                        </span>
                      )}
                    </>
                  ) : (
                    <p className="text-[11px] text-amber-600">
                      No tokens are on the platform allow-list yet. Ask the admin to
                      curate one (Admin → Tokens) before creating a campaign.
                    </p>
                  )}
                </Field>

                <Field label="Customer identity gate (W24)">
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={identityRequired}
                      onChange={(e) => setIdentityRequired(e.target.checked)}
                    />
                    Require customers to be identity-verified to claim
                  </label>
                  <span className="text-[11px] text-slate-500">
                    {identityRequired
                      ? "Claims require a valid zk-X509 verification at claim time."
                      : "Open claim — anyone in the recipient list can claim (no identity check)."}
                  </span>
                </Field>

                {identityRequired && (
                  <Field label="Customer CA registry *">
                    <select
                      className="input"
                      value={registryAddr ?? ""}
                      onChange={(e) => setRegistry(e.target.value as Address)}
                    >
                      {registries?.usersRegistry && (
                        <option value={registries.usersRegistry}>
                          Users registry (standard)
                        </option>
                      )}
                      {registries?.relayersRegistry && (
                        <option value={registries.relayersRegistry}>
                          Relayers registry
                        </option>
                      )}
                    </select>
                  </Field>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-200">
                  List source
                </h2>
                <div className="grid gap-2">
                  {TYPES.map((t) => (
                    <label
                      key={t}
                      className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer text-sm ${
                        type === t
                          ? "border-emerald-500 bg-emerald-500/5"
                          : "border-slate-800 bg-slate-950"
                      }`}
                    >
                      <input
                        type="radio"
                        checked={type === t}
                        onChange={() => setType(t)}
                      />
                      {airdropTypeLabel(t)}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500 font-mono">
                  Eligibility is one Merkle list; the type is how the list is
                  built (CSV, on-chain snapshot, …). The platform fee is charged
                  on the airdrop token and shown at the final step.
                </p>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-200">
                  Recipients &amp; window
                </h2>
                {isSnapshot ? (
                  <Field label="Recipients (on-chain holder snapshot)">
                    <SnapshotBuilder onResult={setSnapResult} />
                  </Field>
                ) : (
                  <Field label="Recipients CSV (address,amount per line)">
                    <textarea
                      className="input font-mono text-xs"
                      rows={6}
                      value={csv}
                      onChange={(e) => setCsv(e.target.value)}
                      placeholder={"0xabc…,120\n0xdef…,80"}
                    />
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs ${csvError ? "text-red-500" : "text-slate-500"}`}
                      >
                        {csvError
                          ? csvError
                          : manifest
                            ? `${recipientCount} recipients · total ${fmtAmount(totalAmount)} (auto)`
                            : "Paste address,amount per line (amount in base units)"}
                      </span>
                      <div className="flex items-center gap-3">
                        <input
                          ref={csvFileRef}
                          type="file"
                          accept=".csv,text/csv,text/plain"
                          className="hidden"
                          onChange={handleCsvFile}
                        />
                        <button
                          type="button"
                          onClick={() => csvFileRef.current?.click()}
                          className="text-[11px] text-emerald-600 inline-flex items-center gap-1 hover:underline"
                        >
                          <Upload className="w-3 h-3" /> Upload CSV
                        </button>
                        <button
                          type="button"
                          onClick={downloadSampleCsv}
                          className="text-[11px] text-emerald-600 inline-flex items-center gap-1 hover:underline"
                        >
                          <Download className="w-3 h-3" /> Sample CSV
                        </button>
                      </div>
                    </div>
                  </Field>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start (optional, to the second)">
                    <input
                      className="input"
                      type="datetime-local"
                      step="1"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </Field>
                  <Field label="Deadline * (to the second)">
                    <input
                      className="input"
                      type="datetime-local"
                      step="1"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-200">
                  Review &amp; create
                </h2>
                <dl className="def-grid text-sm">
                  <dt className="muted">Name</dt>
                  <dd>{name}</dd>
                  {description.trim() && (
                    <>
                      <dt className="muted">Description</dt>
                      <dd className="whitespace-pre-wrap">{description}</dd>
                    </>
                  )}
                  <dt className="muted">Airdrop token</dt>
                  <dd>
                    {isNative ? (
                      "Native ETH"
                    ) : (
                      <>
                        <span className="font-semibold">{unit}</span>{" "}
                        {explorerAddr(token) ? (
                          <a
                            href={explorerAddr(token)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs break-all text-emerald-600 hover:underline"
                          >
                            {token} ↗
                          </a>
                        ) : (
                          <span className="font-mono text-xs break-all text-slate-400">{token}</span>
                        )}
                      </>
                    )}
                  </dd>
                  <dt className="muted">Type</dt>
                  <dd>{airdropTypeLabel(type)}</dd>
                  <dt className="muted">Recipients</dt>
                  <dd>{recipientCount}</dd>
                  <dt className="muted">Total (Σ)</dt>
                  <dd>{fmtAmount(totalAmount)}</dd>
                  <dt className="muted">Claim window</dt>
                  <dd>
                    {startDate ? fmtWhen(startDate) : "immediately on create"} →{" "}
                    {deadline ? fmtWhen(deadline) : "—"}
                    <span className="text-xs text-slate-500"> ({tzLabel})</span>
                  </dd>
                  <dt className="muted">Identity gate</dt>
                  <dd>{identityRequired ? "Required (zk-X509)" : "Open claim"}</dd>
                  <dt className="muted">Merkle root</dt>
                  <dd className="font-mono text-xs break-all">{merkleRoot}</dd>
                  <dt className="muted">Distribution (pool)</dt>
                  <dd>{fmtAmount(totalAmount)}</dd>
                  <dt className="muted">Platform fee</dt>
                  <dd>
                    {fee !== undefined ? fmtAmount(fee) : "…"}
                    {feeRateLabel && (
                      <span className="ml-1.5 text-xs text-slate-500">({feeRateLabel})</span>
                    )}
                  </dd>
                  <dt className="muted">Total deposit</dt>
                  <dd className="font-semibold text-slate-100">
                    {fee !== undefined ? fmtAmount(totalDeposit) : "…"}
                  </dd>
                </dl>

                <p className="text-xs text-slate-500 font-mono">
                  {isNative
                    ? "On-top fee: your wallet sends total + fee in ETH (msg.value). The pool gets the full distribution; the platform vault gets the fee. No approval needed."
                    : "On-top fee: you deposit total + fee in the airdrop token (one approval). The pool gets the full distribution; the platform vault gets the fee. Then createDrop deploys the campaign."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={downloadRecipients}
                    disabled={!activeManifest}
                    className="btn text-xs disabled:opacity-50"
                  >
                    ↓ Download recipients CSV
                  </button>
                </div>
                {insufficient && (
                  <p className="text-xs text-red-500">
                    Insufficient balance: your wallet needs {fmtAmount(totalDeposit)} to fund this
                    drop (total + fee), but holds {fmtAmount(walletBalance as bigint)}.
                  </p>
                )}
                <div className="grid gap-2">
                  {!isNative &&
                    (approved ? (
                      <div className="btn text-emerald-600 border-emerald-500/40 cursor-default">
                        1. Token approved ✓
                      </div>
                    ) : (
                      <TxButton
                        request={approveTokenReq}
                        label="1. Approve token (total + fee)"
                        primary
                        disabled={!approveTokenReq || insufficient}
                        onConfirmed={() => setJustApproved(true)}
                      />
                    ))}
                  <TxButton
                    request={createReq}
                    label={isNative ? "Create campaign (pay in ETH)" : "2. Create campaign"}
                    primary={isNative || approved}
                    disabled={!createReq || insufficient || (!isNative && !approved)}
                    onConfirmed={() => {
                      // Publish the recipient proofs so claimers can look up their
                      // proof by the campaign's merkleRoot.
                      if (activeManifest) {
                        void publishProofs(merkleRoot, activeManifest.claims);
                      }
                    }}
                  />
                </div>
                {ready && !isNative && !approved && !insufficient && (
                  <p className="text-xs text-slate-400">
                    Next: approve the token, then create. (Approve authorizes the factory to pull
                    total + fee.)
                  </p>
                )}
                {ready && (isNative || approved) && !insufficient && (
                  <p className="text-xs text-slate-400">
                    Next: create the campaign to deploy it on-chain.
                  </p>
                )}
                {isPaused ? (
                  <p className="text-xs text-red-500">
                    The platform is paused — new campaigns can&apos;t be created right now. Try again
                    later or contact the admin.
                  </p>
                ) : (
                  !ready && (
                    <p className="text-xs text-amber-600">
                      Complete all steps (allowed token, identity gate, recipients,
                      deadline) to enable creation.
                    </p>
                  )
                )}
              </div>
            )}

            {/* Nav */}
            <div className="flex justify-between pt-4 border-t border-slate-800">
              <button
                className="btn"
                disabled={step === 0}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                Back
              </button>
              {step < STEPS.length - 1 && (
                <button
                  className="btn btn-primary"
                  disabled={!canNext}
                  onClick={() => setStep((s) => s + 1)}
                >
                  Next <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </ConnectGate>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
