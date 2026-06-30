"use client";

import { useMemo, useState } from "react";
import {
  formatUnits,
  isAddress,
  parseUnits,
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
  NATIVE_FEE_TOKEN,
  type AirdropEntry,
} from "@tokamak-network/scatter-drop-sdk";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { ConnectGate } from "@/components/ConnectGate";
import { TxButton } from "@/components/TxButton";
import { deploymentIssue, useDeployment, useFeeOf } from "@/lib/contracts";

const STEPS = ["Operator", "Basics", "Eligibility", "Recipients", "Create"];

const TYPES = [
  AirdropType.CSV,
  AirdropType.ONCHAIN_SNAPSHOT,
  AirdropType.ONCHAIN_GATED,
  AirdropType.SOCIAL,
];

/** Parse "address,amount" lines into entries (amount in token units, 18 dp). */
function parseRecipients(text: string): {
  entries: AirdropEntry[];
  errors: number;
} {
  const entries: AirdropEntry[] = [];
  let errors = 0;
  const seen = new Set<string>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const [addr, amt] = line.split(",").map((s) => s.trim());
    // Cap decimals at 18 so parseUnits can't throw "fractional part exceeds".
    if (!isAddress(addr) || !/^\d+(\.\d{1,18})?$/.test(amt ?? "")) {
      errors++;
      continue;
    }
    // buildDrop throws on duplicate addresses — reject them here as errors.
    const lower = addr.toLowerCase();
    if (seen.has(lower)) {
      errors++;
      continue;
    }
    seen.add(lower);
    entries.push({ account: addr, amount: parseUnits(amt, 18) });
  }
  return { entries, errors };
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

  const { data: fee } = useFeeOf(factory, NATIVE_FEE_TOKEN, type);

  const registryAddr = (registry || registries?.usersRegistry) as
    | Address
    | undefined;
  const tokenValid = isAddress(token);

  const { entries, errors: csvErrors } = useMemo(
    () => parseRecipients(csv),
    [csv],
  );
  const manifest = useMemo(
    () => (entries.length ? buildDrop(entries) : null),
    [entries],
  );
  const totalAmount = manifest ? BigInt(manifest.totalAmount) : 0n;
  const merkleRoot = (manifest?.merkleRoot ?? `0x${"0".repeat(64)}`) as Hex;

  const startParsed = startDate ? Date.parse(`${startDate}T00:00:00Z`) : 0;
  const startUnix = Number.isNaN(startParsed)
    ? 0
    : Math.floor(startParsed / 1000);
  const deadlineParsed = deadline ? Date.parse(`${deadline}T00:00:00Z`) : 0;
  const deadlineUnix = Number.isNaN(deadlineParsed)
    ? 0
    : Math.floor(deadlineParsed / 1000);

  const recipientsValid = entries.length > 0 && csvErrors === 0;
  const windowValid = deadlineUnix > 0 && (startUnix === 0 || deadlineUnix > startUnix);
  const ready =
    !!factory &&
    tokenValid &&
    recipientsValid &&
    windowValid &&
    !!registryAddr &&
    fee !== undefined;

  const approveReq =
    factory && tokenValid && totalAmount > 0n
      ? buildApproveRequest(token as Address, factory, totalAmount)
      : null;
  const createReq =
    ready && registryAddr
      ? buildCreateDropRequest(factory, {
          airdropType: type,
          airdropToken: token as Address,
          merkleRoot,
          totalAmount,
          startTime: BigInt(startUnix),
          deadline: BigInt(deadlineUnix),
          identityRegistry: registryAddr,
          feeToken: NATIVE_FEE_TOKEN,
          fee,
        })
      : null;

  const canNext =
    step === 0 ||
    (step === 1 && tokenValid && !!registryAddr && name.trim().length > 0) ||
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
                  Basics &amp; customer CA registry
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
                </Field>
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
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-200">
                  Eligibility type &amp; fee
                </h2>
                <div className="grid gap-2">
                  {TYPES.map((t) => (
                    <label
                      key={t}
                      className={`flex justify-between items-center p-3 rounded-lg border cursor-pointer text-sm ${
                        type === t
                          ? "border-emerald-500 bg-emerald-500/5"
                          : "border-slate-800 bg-slate-950"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={type === t}
                          onChange={() => setType(t)}
                        />
                        {airdropTypeLabel(t)}
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        Fee:{" "}
                        {fee !== undefined && type === t
                          ? `${formatUnits(fee, 18)} ETH`
                          : "—"}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500 font-mono">
                  v1 core path: CSV → Merkle → immediate. Fee paid in ETH
                  (multi-token/TON discount in a later step).
                </p>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-200">
                  Recipients &amp; window
                </h2>
                <Field label="Recipients CSV (address,amount per line)">
                  <textarea
                    className="input font-mono text-xs"
                    rows={6}
                    value={csv}
                    onChange={(e) => setCsv(e.target.value)}
                    placeholder={"0xabc…,120\n0xdef…,80"}
                  />
                  <span className="text-xs text-slate-500">
                    {entries.length} valid
                    {csvErrors > 0 ? ` · ${csvErrors} invalid line(s)` : ""}
                    {manifest
                      ? ` · total ${formatUnits(totalAmount, 18)} (auto)`
                      : ""}
                  </span>
                </Field>
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
                  <dd>{entries.length}</dd>
                  <dt className="muted">Total (Σ)</dt>
                  <dd>{formatUnits(totalAmount, 18)}</dd>
                  <dt className="muted">Merkle root</dt>
                  <dd className="font-mono text-xs break-all">{merkleRoot}</dd>
                  <dt className="muted">Fee</dt>
                  <dd>{fee !== undefined ? `${formatUnits(fee, 18)} ETH` : "…"}</dd>
                </dl>
                <p className="text-xs text-slate-500 font-mono">
                  Guided: approve the distribution token, then createDrop (fee in
                  ETH as msg.value + token deposit + deploy, one tx).
                </p>
                <div className="grid gap-2">
                  <TxButton
                    request={approveReq}
                    label="1. Approve distribution token"
                    disabled={!approveReq}
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
                    Complete all steps (token, registry, recipients, deadline)
                    to enable creation.
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
