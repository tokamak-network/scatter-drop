"use client";

import { useEffect, useState } from "react";
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
  parseCsv,
  TokenTier,
  type DropManifest,
} from "@tokamak-network/scatter-drop-sdk";
import { ArrowLeft, ArrowRight, Check, Download } from "lucide-react";
import Link from "next/link";
import { ConnectGate } from "@/components/ConnectGate";
import { SnapshotBuilder } from "@/components/SnapshotBuilder";
import { TxButton } from "@/components/TxButton";
import type { SnapshotManifest } from "@/lib/useSnapshotJob";
import {
  deploymentIssue,
  useComputedFee,
  useDeployment,
  useErc20Decimals,
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

  // Token decimals for human-readable display (amounts in CSV are base units).
  const { data: decimals } = useErc20Decimals(
    tokenValid ? (token as Address) : undefined,
  );
  const fmtAmount = (v: bigint) =>
    decimals !== undefined
      ? `${formatUnits(v, decimals)} tokens`
      : `${v.toString()} base units`;

  const startParsed = startDate ? Date.parse(`${startDate}T00:00:00Z`) : 0;
  const startUnix = Number.isNaN(startParsed)
    ? 0
    : Math.floor(startParsed / 1000);
  const deadlineParsed = deadline ? Date.parse(`${deadline}T00:00:00Z`) : 0;
  const deadlineUnix = Number.isNaN(deadlineParsed)
    ? 0
    : Math.floor(deadlineParsed / 1000);

  const recipientsValid = activeManifest !== null;
  // Deadline must be in the future and after the start (mirrors on-chain checks;
  // MIN_DURATION is still enforced on-chain).
  const nowSec = Math.floor(Date.now() / 1000);
  const windowValid =
    deadlineUnix > nowSec && (startUnix === 0 || deadlineUnix > startUnix);
  // Identity gate satisfied: either off (open claim) or a registry is chosen.
  const identityOk = !identityRequired || !!registryAddr;
  const feeValid = fee !== undefined;
  const ready =
    !!factory &&
    tokenValid &&
    tierAllowed &&
    recipientsValid &&
    windowValid &&
    identityOk &&
    feeValid;

  // On-top: a single approval of the airdrop token for total + fee.
  const approveTokenReq =
    factory && tokenValid && totalDeposit > 0n
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
                <Field label="Distribution token (address)">
                  <input
                    className="input"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="0x…"
                  />
                  {token && !tokenValid && (
                    <span className="text-xs text-red-500">Invalid address.</span>
                  )}
                  {tokenValid && tier !== undefined && (
                    <span
                      className={`inline-block text-[10px] font-mono font-bold px-2 py-0.5 mt-1 rounded border ${
                        tierAllowed
                          ? "bg-emerald-950/40 text-emerald-600 border-emerald-900/40"
                          : "bg-amber-950/20 text-amber-600 border-amber-500/20"
                      }`}
                    >
                      {tierAllowed ? "ALLOWED" : "NOT ALLOWED"}
                    </span>
                  )}
                  {tokenValid && tier !== undefined && !tierAllowed && (
                    <span className="text-[11px] text-slate-500">
                      This token isn&apos;t on the platform allow-list. Ask the
                      admin to add it before creating a campaign.
                    </span>
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
                      <button
                        type="button"
                        onClick={downloadSampleCsv}
                        className="text-[11px] text-emerald-600 inline-flex items-center gap-1 hover:underline"
                      >
                        <Download className="w-3 h-3" /> Sample CSV
                      </button>
                    </div>
                  </Field>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start (optional)">
                    <input
                      className="input"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </Field>
                  <Field label="Deadline *">
                    <input
                      className="input"
                      type="date"
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
                  <dt className="muted">Type</dt>
                  <dd>{airdropTypeLabel(type)}</dd>
                  <dt className="muted">Recipients</dt>
                  <dd>{recipientCount}</dd>
                  <dt className="muted">Total (Σ)</dt>
                  <dd>{fmtAmount(totalAmount)}</dd>
                  <dt className="muted">Identity gate</dt>
                  <dd>{identityRequired ? "Required (zk-X509)" : "Open claim"}</dd>
                  <dt className="muted">Merkle root</dt>
                  <dd className="font-mono text-xs break-all">{merkleRoot}</dd>
                  <dt className="muted">Distribution (pool)</dt>
                  <dd>{fmtAmount(totalAmount)}</dd>
                  <dt className="muted">Platform fee</dt>
                  <dd>{fee !== undefined ? fmtAmount(fee) : "…"}</dd>
                  <dt className="muted">Total deposit</dt>
                  <dd className="font-semibold text-slate-100">
                    {fee !== undefined ? fmtAmount(totalDeposit) : "…"}
                  </dd>
                </dl>

                <p className="text-xs text-slate-500 font-mono">
                  On-top fee: you deposit total + fee in the airdrop token (one
                  approval). The pool gets the full distribution; the platform
                  vault gets the fee. Then createDrop deploys the campaign.
                </p>
                <div className="grid gap-2">
                  <TxButton
                    request={approveTokenReq}
                    label="1. Approve token (total + fee)"
                    disabled={!approveTokenReq}
                  />
                  <TxButton
                    request={createReq}
                    label="2. Create campaign"
                    primary
                    disabled={!createReq}
                  />
                </div>
                {!ready && (
                  <p className="text-xs text-amber-600">
                    Complete all steps (allowed token, identity gate, recipients,
                    deadline) to enable creation.
                  </p>
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
