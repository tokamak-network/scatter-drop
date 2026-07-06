"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useBalance, useChainId, useChains } from "wagmi";
import {
  formatUnits,
  isAddress,
  zeroAddress,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import {
  AirdropType,
  airdropTypeLabel,
  buildApproveRequest,
  buildCreateDropRequest,
  buildCreateDropOneTxRequest,
  buildPublishProofsRequest,
  buildDrop,
  getZkX509,
  NATIVE_ETH,
  parseCsv,
  TokenTier,
  type DropManifest,
} from "@tokamak-network/scatter-drop-sdk";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Download, Loader2, Upload } from "lucide-react";
import Link from "next/link";
import { ConnectGate } from "@/components/ConnectGate";
import { CopyButton } from "@/components/CopyButton";
import { NetworkSelect } from "@/components/NetworkSelect";
import {
  inkBtnClass,
  POP_HEADING,
  POP_LABEL,
  POP_PANEL,
  popInputClass,
  whiteBtnClass,
} from "@/components/pop";
import { TxButton } from "@/components/TxButton";
import { TxHashLink } from "@/components/TxHashLink";
import { anchorRequired, useAllowedTokens } from "@/lib/campaigns";
import { findDropCreated } from "@/lib/dropScan";
import { DRAFT_CSV_KEY } from "@/lib/draftCsv";
import { downloadCsv } from "@/lib/download";
import { toCsv } from "@/lib/reports";
import { explorerUrl, shortHash } from "@/lib/explorer";
import { patchAnnouncement, useAnnouncements } from "@/lib/announcements";
import { publishCampaignMeta } from "@/lib/campaignMeta";
import { publishProofs } from "@/lib/proofs";
import { useWalletSession } from "@/lib/useWalletSession";
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
  useSupportsApproveAndCall,
  useTokenTier,
} from "@/lib/contracts";

const SAMPLE_CSV =
  "# amounts are token units with decimals applied (not wei/base units)\naddress,amount\n0x70997970C51812dc3A010C7d01b50e0d17dc79C8,1000\n0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,500";

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

/** The wizard's shared field skin (inputs, selects, textareas). */
const wizInputCls = popInputClass("px-3 py-2 rounded-xl");

// ONCHAIN_SNAPSHOT is deliberately absent: a balance snapshot is gameable by
// moving funds between wallets during the claim window, so it's retired as a
// creatable source (the on-chain enum and existing campaigns are untouched).
//
// `blurb` explains the type in the picker; `forcesIdentity` marks the type
// whose claim path is meaningless without a zk-X509 gate (ONCHAIN_GATED), so
// the wizard pins the identity gate ON for it.
const TYPES: {
  value: AirdropType;
  blurb: string;
  forcesIdentity?: boolean;
}[] = [
  {
    value: AirdropType.CSV,
    blurb: "A fixed allow-list of addresses and amounts. Anyone on the list can claim.",
  },
  {
    value: AirdropType.ONCHAIN_GATED,
    blurb:
      "The list decides WHO is eligible; a national-PKI (zk-X509) check at claim time decides they're a real, verified person. Claiming needs both a Merkle proof and identity verification.",
    forcesIdentity: true,
  },
  {
    value: AirdropType.SOCIAL,
    blurb:
      "Reward completed quests/tasks. Import the winners exported from your quest platform (Galxe/Zealy CSV); pair with an identity gate to keep it Sybil-resistant.",
  },
];

/**
 * Parse the recipients CSV using the SDK `parseCsv` (single source of truth) and
 * build the Merkle drop, so the wizard's tree/root/total match the SDK + claim
 * path exactly. CSV amounts are human token amounts ("1000", "1.5") — the
 * operator's mental model — scaled to base units by the selected token's
 * `decimals` before they're committed to the tree. `parseCsv` and `buildDrop`
 * throw on malformed/duplicate rows, which we surface as a message instead of
 * crashing the render.
 */
function parseRecipients(
  text: string,
  decimals: number,
): {
  manifest: DropManifest | null;
  error: string | null;
} {
  if (!text.trim()) return { manifest: null, error: null };
  try {
    const entries = parseCsv(text, { decimals });
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

  // ONCHAIN_GATED's whole premise is a verified-person check, so the identity
  // gate is mandatory for it. Rather than sync `identityRequired` through an
  // effect (which would stick the operator's toggle ON even after they leave
  // the gated type), derive the effective value: forced types are always
  // gated, everyone else keeps the operator's own choice. Other types keep it
  // operator-controlled (SOCIAL defaults ON for Sybil-resistance).
  const identityForced = TYPES.find((t) => t.value === type)?.forcesIdentity ?? false;
  const identityRequiredEff = identityForced || identityRequired;

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

  // Native ETH airdrop: the sentinel token, funded via msg.value (no approve).
  const isNative =
    tokenValid && (token as string).toLowerCase() === NATIVE_ETH.toLowerCase();

  // Token decimals + symbol — CSV amounts are human units and scale by these.
  // Native ETH has no ERC-20 contract, so use 18 / "ETH" directly.
  const { data: erc20Decimals } = useErc20Decimals(
    tokenValid && !isNative ? (token as Address) : undefined,
  );
  const { data: erc20Symbol } = useErc20Symbol(
    tokenValid && !isNative ? (token as Address) : undefined,
  );
  // Normalize the on-chain uint8 (decoders may hand back number or bigint).
  const decimals =
    isNative ? 18 : erc20Decimals === undefined ? undefined : Number(erc20Decimals);
  // Show the real token symbol instead of a generic "tokens" once it's known.
  const unit = isNative ? "ETH" : erc20Symbol ? String(erc20Symbol) : "tokens";
  /** Human-unit string for a base-unit value — the only dialect the wizard emits. */
  const humanAmount = (v: bigint) =>
    decimals !== undefined ? formatUnits(v, decimals) : v.toString();
  const fmtAmount = (v: bigint) =>
    decimals !== undefined ? `${humanAmount(v)} ${unit}` : `${v.toString()} base units`;

  // Debounce parsing/Merkle build so large lists don't rebuild on every
  // keystroke. Amounts are human units scaled by the token's decimals, so the
  // build waits for them to resolve and re-runs on a token switch; the ref
  // guard skips rebuilding an identical tree when a token re-read resolves to
  // the same decimals (a 50k-row build is main-thread work).
  const [parsed, setParsed] = useState<{
    manifest: DropManifest | null;
    error: string | null;
  }>({ manifest: null, error: null });
  const lastBuilt = useRef<{ csv: string; decimals: number } | null>(null);
  useEffect(() => {
    if (decimals === undefined) {
      // Token cleared/invalid: drop the stale tree rather than keep showing a
      // manifest scaled for the previous token. A mid-read undefined for the
      // SAME token resolves quickly and the ref guard skips the no-op rebuild.
      if (!tokenValid && lastBuilt.current) {
        lastBuilt.current = null;
        setParsed({ manifest: null, error: null });
      }
      return;
    }
    if (lastBuilt.current?.csv === csv && lastBuilt.current.decimals === decimals) return;
    const t = setTimeout(() => {
      lastBuilt.current = { csv, decimals };
      setParsed(parseRecipients(csv, decimals));
    }, 400);
    return () => clearTimeout(t);
    // tokenValid only matters on the decimals===undefined early return; the
    // ref guard makes re-runs no-ops, so satisfying the linter is free.
  }, [csv, decimals, tokenValid]);
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

  const recipientCount = manifest?.count ?? 0;
  const totalAmount = manifest ? BigInt(manifest.totalAmount) : 0n;
  const merkleRoot = (manifest?.merkleRoot ?? `0x${"0".repeat(64)}`) as Hex;

  // W22: fee = computed on the airdrop token (percent of total or flat). The
  // operator deposits total + fee (on-top); pool gets total, vault gets fee.
  const { data: fee } = useComputedFee(
    factory,
    tokenValid ? (token as Address) : undefined,
    totalAmount,
  );
  const totalDeposit = totalAmount + (fee ?? 0n);

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

  // Upcoming-board tie-in: the operator's still-open announcements can be
  // linked to the campaign this wizard creates (flips the board entry from
  // UPCOMING to the drop's live on-chain lifecycle).
  const { data: myAnnouncements } = useAnnouncements(account, { enabled: !!account });
  const openAnnouncements = (myAnnouncements ?? []).filter((a) => !a.drop && !a.canceled);
  const [announcementId, setAnnouncementId] = useState("");
  // The announcement selection is derived, not reset: the list is
  // chain-scoped, so a selection made on another network (or one canceled
  // elsewhere) simply stops resolving — nothing stale can be linked (the
  // server's dropVerify rejects it as the backstop).
  const linkedAnnouncementId = openAnnouncements.some((a) => a.id === announcementId)
    ? announcementId
    : "";
  // Chain-scoped address inputs must not survive a network switch — a
  // token/registry address means something else (or nothing) on the new
  // chain. Chain-independent inputs (name, dates, CSV recipient
  // lists — cross-chain drops like "mainnet stakers, L2 payout" are a real
  // use case) are deliberately kept.
  useEffect(() => {
    setToken("");
    setRegistry("");
  }, [chainId]);
  const { ensureSession } = useWalletSession(
    "Sign in to scatter.drop to manage your announcements.",
  );

  // Post-creation state driving the success panel: the drop, its creation tx,
  // the pinned proofs CID (null after settle = pin unavailable — server
  // pinning not configured or failed), and whether the anchor tx confirmed.
  const [createdDrop, setCreatedDrop] = useState<Address | null>(null);
  const [createdTx, setCreatedTx] = useState<Hex | null>(null);
  const [proofsCid, setProofsCid] = useState<string | null>(null);
  const [pinSettled, setPinSettled] = useState(false);
  const [anchored, setAnchored] = useState(false);

  // After createDrop confirms: publish the recipient proofs (claimers look
  // their proof up by merkleRoot) and the wizard's name/description (not in
  // the on-chain event — without this the entered copy is silently lost).
  // Meta + announcement writes are operator-authenticated, so establish the
  // SIWE session once and share it; both sends carry the creation txHash so
  // the server verifies ownership with a single receipt read. All best-effort
  // — a failure never blocks the created campaign.
  const onCampaignCreated = (receipt: TransactionReceipt) => {
    setCreatedTx(receipt.transactionHash);
    const drop = dep && findDropCreated(receipt.logs, dep.dropFactory)?.drop;
    if (drop) setCreatedDrop(drop);
    // Proofs publish is now operator-authenticated (the store no longer takes
    // anonymous writes), so it rides the same SIWE session as the meta and
    // announcement writes below — nothing here happens before ensureSession.
    if (!drop) {
      setPinSettled(true);
      return;
    }
    const trimmedName = name.trim();
    // Nothing operator-authenticated to do → don't prompt for a signature.
    if (!manifest && !trimmedName && !linkedAnnouncementId) {
      setPinSettled(true);
      return;
    }
    void ensureSession(account).then((session) => {
      if (!session) {
        // No session (user declined the signature) → the list can't be
        // published now; the success checklist offers doing it later.
        setPinSettled(true);
        return;
      }
      if (manifest && dep) {
        // The returned CID (when pinning is configured) feeds the anchor tx in
        // the success checklist. Keyed by the vault (chainId, drop); the
        // creation txHash lets the server verify ownership with one receipt read.
        void publishProofs(
          dep.chainId,
          drop,
          merkleRoot,
          manifest.claims,
          receipt.transactionHash,
        )
          .then(setProofsCid)
          .finally(() => setPinSettled(true));
      } else {
        setPinSettled(true);
      }
      if (trimmedName) {
        void publishCampaignMeta({
          chainId,
          drop,
          name: trimmedName,
          description: description.trim(),
          txHash: receipt.transactionHash,
        });
      }
      if (linkedAnnouncementId) {
        void patchAnnouncement(linkedAnnouncementId, {
          drop: drop.toLowerCase(),
          txHash: receipt.transactionHash,
        });
      }
    });
  };

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
  // Final recipient CSV — the committed allocations in human token units
  // (formatUnits is lossless), so the download round-trips through the same
  // upload box. Guarded on decimals so only one dialect can leave the wizard.
  const downloadRecipients = () => {
    if (!manifest || decimals === undefined) return;
    const claims = Object.values(manifest.claims) as { account: string; amount: string }[];
    const dataRows = claims.map((c) => [c.account, humanAmount(BigInt(c.amount))]);
    // Data cells go through toCsv (RFC-4180 quote + formula-injection guard).
    // The '#' note stays a plain comment (skippable on re-import); the on-chain
    // symbol is stripped of commas/quotes/control chars so the note never needs
    // quoting (which would drop the leading '#') and a formula char stays
    // mid-cell after '# amounts in ' — never at a cell start.
    const noteUnit = unit.replace(/[^ -~]/g, "").replace(/[",]/g, "").trim() || "tokens";
    const note = `# amounts in ${noteUnit} - token units with decimals applied (not wei/base units)`;
    downloadCsv(
      `${name.trim() || "drop"}-recipients.csv`,
      `${note}\r\n${toCsv(["address", "amount"], dataRows)}`,
    );
  };

  // Operators pick from the admin-curated allow-list rather than pasting an
  // arbitrary address (the on-chain createDrop rejects non-allow-listed tokens).
  const { data: allowedTokens } = useAllowedTokens();

  // datetime-local values (YYYY-MM-DDTHH:MM:SS, no tz) are parsed as local time,
  // to the second, then converted to unix seconds for the on-chain window.
  const toUnix = (v: string) => {
    if (!v) return 0;
    const ms = new Date(v).getTime();
    return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
  };
  const startUnix = toUnix(startDate);
  const deadlineUnix = toUnix(deadline);

  const recipientsValid = manifest !== null;
  // Deadline must be in the future and after the start (mirrors on-chain checks;
  // MIN_DURATION is still enforced on-chain).
  const nowSec = Math.floor(Date.now() / 1000);
  const windowValid =
    deadlineUnix > nowSec && (startUnix === 0 || deadlineUnix > startUnix);
  // Identity gate satisfied: either off (open claim) or a registry is chosen.
  const identityOk = !identityRequiredEff || !!registryAddr;
  const feeValid = fee !== undefined;
  // Service pause: while the platform is paused, createDrop reverts on-chain, so
  // block creation in the UI too (with a clear reason).
  const { data: paused } = usePaused(factory);
  const isPaused = paused === true;
  // approveAndCall (one-tx) support is an admin-curated, per-token property on the
  // factory — read it rather than asking the operator to assert it.
  const { data: tokenSupportsOneTx } = useSupportsApproveAndCall(
    factory,
    isNative ? undefined : (token as Address),
  );
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
  const dropParams = {
    airdropType: type,
    airdropToken: token as Address,
    merkleRoot,
    totalAmount,
    startTime: BigInt(startUnix),
    deadline: BigInt(deadlineUnix),
    identityRegistry: identityRequiredEff && registryAddr ? registryAddr : zeroAddress,
    // For native ETH, the builder sets msg.value = totalAmount + fee.
    fee: fee ?? 0n,
  };
  const createReq = ready && factory ? buildCreateDropRequest(factory, dropParams) : null;
  // The one-tx (approveAndCall → onApprove) path is used automatically for ERC-20
  // tokens the admin has flagged as approveAndCall-capable; `ready` already implies
  // `fee` is set. One flag drives the guard, the button, and the hint below.
  const singleTx = !isNative && tokenSupportsOneTx === true;
  const oneTxReq =
    ready && factory && singleTx ? buildCreateDropOneTxRequest(factory, dropParams, fee ?? 0n) : null;

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
        className="inline-flex items-center gap-2 text-ink/60 hover:text-ink transition text-sm font-bold"
      >
        <ArrowLeft className="w-4 h-4" /> Back to console
      </Link>

      <h1 className="font-chunk uppercase text-2xl md:text-3xl tracking-tight text-ink">
        New campaign
      </h1>

      {/* Target network — the campaign deploys on the wallet's active chain,
          so make that choice explicit before anything else. */}
      <NetworkSelect />

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div
              className={`flex items-center gap-2 text-xs font-mono font-bold ${i <= step ? "text-ink" : "text-ink/40"}`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border-2 ${
                  i < step
                    ? "bg-pop-mint text-ink border-ink"
                    : i === step
                      ? "bg-pop-yellow text-ink border-ink"
                      : "bg-white text-ink/40 border-ink/20"
                }`}
              >
                {i < step ? <Check className="w-3 h-3" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-0.5 flex-1 rounded ${i < step ? "bg-ink" : "bg-ink/15"}`}
              />
            )}
          </div>
        ))}
      </div>

      <ConnectGate prompt="Step 0 — operator identity verification is required to create a campaign. Connect your wallet to begin.">
        {depIssue || !factory ? (
          <p className="text-ink/60 text-sm">{depIssue ?? "No deployment."}</p>
        ) : (
          <div className={`bg-white p-6 space-y-5 ${POP_PANEL}`}>
            {step === 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-ink">
                  Operator identity gate
                </h2>
                <p className="text-sm text-ink/70 leading-relaxed">
                  Creating a campaign requires your wallet to be verified in the
                  operator registry (operatorRegistry.verifiedUntil(you) ≥ now),
                  enforced on-chain at createDrop. Verify via zk-X509 if needed.
                </p>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-ink">
                  Basics &amp; eligibility gate
                </h2>
                <Field label="Campaign name">
                  <input
                    className={wizInputCls}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Acme Loyalty Drop"
                  />
                </Field>
                <Field label="Description">
                  <input
                    className={wizInputCls}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Reward for verified customers"
                  />
                </Field>
                <Field label="Distribution token (allow-list)">
                  {allowedTokens && allowedTokens.length > 0 ? (
                    <>
                      <select
                        className={wizInputCls}
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
                        <p className="text-[11px] text-ink/50 font-mono mt-1 break-all">
                          {token}
                        </p>
                      )}
                      {isNative && (
                        <span className="text-[11px] text-ink/50">
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
                  <label
                    className={`flex items-center gap-2 text-sm text-ink/80 ${
                      identityForced ? "opacity-70" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={identityRequiredEff}
                      disabled={identityForced}
                      onChange={(e) => setIdentityRequired(e.target.checked)}
                    />
                    Require customers to be identity-verified to claim
                  </label>
                  <span className="text-[11px] text-ink/50">
                    {identityForced
                      ? `${airdropTypeLabel(type)} campaigns are always identity-gated — the type is meaningless without a verified-person check.`
                      : identityRequired
                        ? "Claims require a valid zk-X509 verification at claim time."
                        : "No identity gate — anyone on the recipient list can claim without identity verification."}
                  </span>
                </Field>

                {identityRequiredEff && (
                  <Field label="Customer CA registry *">
                    <select
                      className={wizInputCls}
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
                    {/* GatePreview (K2, components/GatePreview.tsx): paste an
                        address → useVerifiedUntil shows ✓/✗ so the operator can
                        sanity-check the chosen registry against a known wallet.
                        Placeholder until that component lands. */}
                    {registryAddr && (
                      <p className="text-[11px] text-ink/50 mt-1">
                        Registry {registryAddr.slice(0, 6)}…{registryAddr.slice(-4)} — a
                        verification preview will appear here.
                      </p>
                    )}
                  </Field>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-ink">
                  List source
                </h2>
                <div className="grid gap-2">
                  {TYPES.map((t) => (
                    <label
                      key={t.value}
                      className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer text-sm ${
                        type === t.value
                          ? "border-ink bg-pop-yellow/40"
                          : "border-ink/15 bg-white hover:border-ink/40"
                      }`}
                    >
                      <input
                        type="radio"
                        className="mt-0.5"
                        checked={type === t.value}
                        onChange={() => setType(t.value)}
                      />
                      <span className="space-y-0.5">
                        <span className="block font-semibold text-ink">
                          {airdropTypeLabel(t.value)}
                        </span>
                        <span className="block text-[11px] text-ink/60 leading-relaxed">
                          {t.blurb}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-ink/50 font-mono">
                  Recipients come from the list on the next step; the type sets
                  how eligibility is decided. The platform fee is charged on the
                  distribution token and shown at the final step.
                </p>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-ink">
                  Recipients &amp; window
                </h2>
                {type === AirdropType.ONCHAIN_GATED && (
                  <p className="text-xs font-medium text-ink/70 bg-pop-sky/30 border-2 border-ink/10 rounded-xl px-3 py-2 leading-relaxed">
                    This list decides <strong>who</strong> is eligible. At claim
                    time each address must <strong>also</strong> pass the zk-X509
                    identity check — a Merkle proof alone won&apos;t claim.
                  </p>
                )}
                {type === AirdropType.SOCIAL && (
                  <p className="text-xs font-medium text-ink/70 bg-pop-mint/30 border-2 border-ink/10 rounded-xl px-3 py-2 leading-relaxed">
                    Paste the quest winners exported from your platform
                    (Galxe/Zealy). {identityRequiredEff
                      ? "The identity gate keeps it Sybil-resistant."
                      : "Consider keeping the identity gate on for Sybil-resistance."}{" "}
                    A dedicated importer with per-winner amounts is coming to this
                    step.
                  </p>
                )}
                <Field label="Recipients CSV (address,amount per line)">
                  <textarea
                    className={`${wizInputCls} font-mono text-xs`}
                    rows={6}
                    value={csv}
                    onChange={(e) => setCsv(e.target.value)}
                    placeholder={"0xabc…,120\n0xdef…,80"}
                  />
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs ${csvError ? "text-rose-500" : "text-ink/50"}`}
                    >
                      {csvError
                        ? csvError
                        : manifest
                          ? `${recipientCount} recipients · total ${fmtAmount(totalAmount)} (auto)`
                          : csv.trim() && decimals === undefined
                            ? "Select the distribution token first — amounts are validated against its decimals"
                            : `Paste address,amount per line (amount in ${unit}, e.g. 120 or 1.5)`}
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
                        className="text-[11px] font-bold text-ink/70 inline-flex items-center gap-1 hover:text-ink hover:underline"
                      >
                        <Upload className="w-3 h-3" /> Upload CSV
                      </button>
                      <button
                        type="button"
                        onClick={downloadSampleCsv}
                        className="text-[11px] font-bold text-ink/70 inline-flex items-center gap-1 hover:text-ink hover:underline"
                      >
                        <Download className="w-3 h-3" /> Sample CSV
                      </button>
                    </div>
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start (optional, to the second)">
                    <input
                      className={wizInputCls}
                      type="datetime-local"
                      step="1"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </Field>
                  <Field label="Deadline * (to the second)">
                    <input
                      className={wizInputCls}
                      type="datetime-local"
                      step="1"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            )}

            {step === 4 && !createdDrop && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-ink">
                  Review &amp; create
                </h2>
                <dl className="def-grid text-sm">
                  <dt className="text-ink/50">Name</dt>
                  <dd>{name}</dd>
                  {description.trim() && (
                    <>
                      <dt className="text-ink/50">Description</dt>
                      <dd className="whitespace-pre-wrap">{description}</dd>
                    </>
                  )}
                  <dt className="text-ink/50">Distribution token</dt>
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
                            className="font-mono text-xs break-all text-ink underline hover:text-ink/70"
                          >
                            {token} ↗
                          </a>
                        ) : (
                          <span className="font-mono text-xs break-all text-ink/60">{token}</span>
                        )}
                      </>
                    )}
                  </dd>
                  <dt className="text-ink/50">Type</dt>
                  <dd>{airdropTypeLabel(type)}</dd>
                  <dt className="text-ink/50">Recipients</dt>
                  <dd>{recipientCount}</dd>
                  <dt className="text-ink/50">Total (Σ)</dt>
                  <dd>{fmtAmount(totalAmount)}</dd>
                  <dt className="text-ink/50">Claim window</dt>
                  <dd>
                    {startDate ? fmtWhen(startDate) : "immediately on create"} →{" "}
                    {deadline ? fmtWhen(deadline) : "—"}
                    <span className="text-xs text-ink/50"> ({tzLabel})</span>
                  </dd>
                  <dt className="text-ink/50">Identity gate</dt>
                  <dd>{identityRequiredEff ? "Required (zk-X509)" : "No identity gate"}</dd>
                  <dt className="text-ink/50">Merkle root</dt>
                  <dd className="font-mono text-xs break-all">{merkleRoot}</dd>
                  <dt className="text-ink/50">Distribution (pool)</dt>
                  <dd>{fmtAmount(totalAmount)}</dd>
                  <dt className="text-ink/50">Platform fee</dt>
                  <dd>
                    {fee !== undefined ? fmtAmount(fee) : "…"}
                    {feeRateLabel && (
                      <span className="ml-1.5 text-xs text-ink/50">({feeRateLabel})</span>
                    )}
                  </dd>
                  <dt className="text-ink/50">Total deposit</dt>
                  <dd className="font-semibold text-ink">
                    {fee !== undefined ? fmtAmount(totalDeposit) : "…"}
                  </dd>
                </dl>

                {openAnnouncements.length > 0 && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="link-announcement"
                      className={POP_LABEL}
                    >
                      Link an Upcoming announcement (optional)
                    </label>
                    <select
                      id="link-announcement"
                      value={linkedAnnouncementId}
                      onChange={(e) => {
                        setAnnouncementId(e.target.value);
                        // Sign in now so the post-creation link PATCH can't die
                        // on a missing session mid-confirmation.
                        if (e.target.value) void ensureSession(account);
                      }}
                      className={wizInputCls}
                    >
                      <option value="">— none —</option>
                      {openAnnouncements.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-ink/50 leading-snug">
                      The board entry then follows this campaign&apos;s on-chain claim
                      window (UPCOMING → LIVE → ENDED).
                    </p>
                  </div>
                )}

                <p className="text-xs text-ink/50 font-mono">
                  {isNative
                    ? "On-top fee: your wallet sends total + fee in ETH (msg.value). The pool gets the full distribution; the platform vault gets the fee. No approval needed."
                    : "On-top fee: you deposit total + fee in the distribution token (one approval). The pool gets the full distribution; the platform vault gets the fee. Then createDrop deploys the campaign."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={downloadRecipients}
                    disabled={!manifest || decimals === undefined}
                    className={`text-xs disabled:opacity-50 ${whiteBtnClass("md")}`}
                  >
                    ↓ Download recipients CSV
                  </button>
                </div>
                {insufficient && (
                  <p className="text-xs text-rose-500">
                    Insufficient balance: your wallet needs {fmtAmount(totalDeposit)} to fund this
                    drop (total + fee), but holds {fmtAmount(walletBalance as bigint)}.
                  </p>
                )}
                {singleTx && (
                  <p className="text-[11px] font-bold text-emerald-600">
                    This token supports <span className="font-mono">approveAndCall</span> — it will be
                    created in a single transaction.
                  </p>
                )}
                <div className="grid gap-2">
                  {singleTx ? (
                    // approveAndCall → onApprove: the token approves + the factory
                    // creates and funds the campaign in a single operator tx.
                    <TxButton
                      request={oneTxReq}
                      label="Create campaign"
                      primary
                      disabled={!oneTxReq || insufficient}
                      disableWhenConfirmed
                      onConfirmed={onCampaignCreated}
                    />
                  ) : (
                    <>
                      {!isNative &&
                        (approved ? (
                          <div className="inline-flex items-center gap-1.5 w-fit text-xs font-bold text-ink bg-pop-mint border-2 border-ink rounded-full px-3 py-1.5">
                            <Check className="w-3.5 h-3.5" /> 1. Token approved
                          </div>
                        ) : (
                          <TxButton
                            request={approveTokenReq}
                            label="1. Approve token (total + fee)"
                            primary
                            disabled={!approveTokenReq || insufficient}
                            disableWhenConfirmed
                            onConfirmed={() => setJustApproved(true)}
                          />
                        ))}
                      <TxButton
                        request={createReq}
                        label={isNative ? "Create campaign (pay in ETH)" : "2. Create campaign"}
                        primary={isNative || approved}
                        disabled={!createReq || insufficient || (!isNative && !approved)}
                        disableWhenConfirmed
                        onConfirmed={onCampaignCreated}
                      />
                    </>
                  )}
                </div>
                {ready && !insufficient && (
                  <p className="text-xs text-ink/60">
                    {singleTx ? (
                      <>
                        Next: one transaction — <span className="font-mono">approveAndCall</span>{" "}
                        approves and creates the campaign together.
                      </>
                    ) : isNative || approved ? (
                      "Next: create the campaign to deploy it on-chain."
                    ) : (
                      "Next: approve the token, then create. (Approve authorizes the factory to pull total + fee.)"
                    )}
                  </p>
                )}
                {isPaused ? (
                  <p className="text-xs text-rose-500">
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

            {/* Success moment — replaces the review once the campaign is
                on-chain, so "did it work?" is never ambiguous. For CSV drops
                the on-chain anchor is a REQUIRED follow-up step (the list has
                no other serverless recovery path); the CID only exists after
                the pin, so create + anchor can't be one atomic tx — this is
                deliberately a two-signature checklist. */}
            {step === 4 && createdDrop && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 shrink-0 rounded-full bg-pop-mint border-2 border-ink flex items-center justify-center">
                    <Check className="w-5 h-5 text-ink" />
                  </span>
                  <h2 className="font-chunk uppercase text-xl tracking-tight text-ink">
                    Campaign created
                  </h2>
                </div>

                <dl className="def-grid text-sm">
                  <dt className="text-ink/50">Campaign</dt>
                  <dd className="font-mono text-xs break-all flex items-center gap-1.5">
                    {createdDrop}
                    <CopyButton value={createdDrop} label="Copy campaign address" />
                  </dd>
                  {createdTx && (
                    <>
                      <dt className="text-ink/50">Creation tx</dt>
                      <dd className="font-mono text-xs flex items-center gap-1.5">
                        <TxHashLink hash={createdTx} />
                        <CopyButton value={createdTx} label="Copy transaction hash" />
                      </dd>
                    </>
                  )}
                </dl>

                {manifest && (
                  <div className="rounded-2xl border-2 border-ink/15 p-4 space-y-3">
                    <h3 className={POP_HEADING}>
                      {anchorRequired(type)
                        ? "Finish setup — anchor required"
                        : "Recipient list durability"}
                    </h3>
                    <ChecklistRow state="done">Campaign created</ChecklistRow>
                    {!pinSettled ? (
                      <ChecklistRow state="pending">Pinning recipient list to IPFS…</ChecklistRow>
                    ) : proofsCid ? (
                      <ChecklistRow state="done">
                        Recipient list pinned to IPFS (
                        <span className="font-mono" title={proofsCid}>
                          {shortHash(proofsCid)}
                        </span>
                        )
                      </ChecklistRow>
                    ) : (
                      <ChecklistRow state="warn">
                        Pinning is unavailable (not configured or failed) — pin and
                        anchor the list later from the campaign&apos;s Proofs tab.
                      </ChecklistRow>
                    )}
                    {proofsCid && factory && (
                      anchored ? (
                        <ChecklistRow state="done">Recipient list anchored on-chain</ChecklistRow>
                      ) : (
                        <div className="space-y-2">
                          <ChecklistRow state="todo">
                            Anchor the list&apos;s CID on-chain
                            {anchorRequired(type) ? " (required)" : " (recommended)"}
                          </ChecklistRow>
                          <TxButton
                            request={buildPublishProofsRequest(factory, createdDrop, proofsCid)}
                            label="Anchor recipient list on-chain"
                            primary={anchorRequired(type)}
                            disableWhenConfirmed
                            onConfirmed={() => setAnchored(true)}
                          />
                          {anchorRequired(type) && (
                            <p className="text-xs font-medium text-amber-600">
                              Don&apos;t leave before anchoring: for CSV drops the
                              anchor is the only serverless way claimers can recover
                              the recipient list. You can re-pin and re-anchor an
                              updated list any time before the claim window opens.
                            </p>
                          )}
                        </div>
                      )
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/manage/${createdDrop}`}
                    className={`text-xs flex items-center gap-1.5 ${inkBtnClass("lg")}`}
                  >
                    Manage campaign
                  </Link>
                  <Link
                    href={`/c/${createdDrop}`}
                    className={`text-xs flex items-center gap-1.5 ${whiteBtnClass("lg")}`}
                  >
                    View claim page <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )}

            {/* Nav — hidden once the campaign exists (going "Back" into the
                form after creation would only invite a duplicate). */}
            {!createdDrop && (
              <div className="flex justify-between pt-4 border-t-2 border-ink/10">
                <button
                  type="button"
                  className={`text-xs disabled:opacity-50 ${whiteBtnClass("lg")}`}
                  disabled={step === 0}
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                >
                  Back
                </button>
                {step < STEPS.length - 1 && (
                  <button
                    type="button"
                    className={`text-xs flex items-center gap-1 disabled:opacity-50 ${inkBtnClass("lg")}`}
                    disabled={!canNext}
                    onClick={() => setStep((s) => s + 1)}
                  >
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
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
      <span className={POP_LABEL}>{label}</span>
      {children}
    </label>
  );
}

/** One line of the post-creation durability checklist. */
function ChecklistRow({
  state,
  children,
}: {
  state: "done" | "pending" | "todo" | "warn";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-start gap-2 text-sm ${
        state === "warn" ? "font-medium text-amber-600" : "text-ink/80"
      }`}
    >
      <span
        className={`mt-0.5 w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center ${
          state === "done"
            ? "bg-pop-mint border-ink text-ink"
            : state === "pending"
              ? "bg-white border-ink/30 text-ink/50"
              : state === "warn"
                ? "bg-white border-amber-500 text-amber-600"
                : "bg-pop-yellow border-ink text-ink"
        }`}
      >
        {state === "done" ? (
          <Check className="w-3 h-3" />
        ) : state === "pending" ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <span className="text-[10px] font-bold">!</span>
        )}
      </span>
      <span>{children}</span>
    </div>
  );
}
